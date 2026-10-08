import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { addCents } from "@paperclipai/shared";
import type { CostByDepartment, CostByProject, CostByTeam } from "@paperclipai/shared";
import { derivePluginDatabaseNamespace } from "./plugin-database.js";
import { estimateTokenCostUsd } from "./cost-estimation.js";
import type { CostDateRange } from "./costs.js";

type Totals = { costCentsExact?: string; referenceCostCents?: number; reportedCostCents?: number; estimatedCostCents?: number; unpricedEventCount?: number } & Pick<CostByProject, "costCents" | "inputTokens" | "cachedInputTokens" | "outputTokens">;
export type AttributedCost = Totals & { provider?: string; model?: string; biller?: string; billingType?: string; costStatus?: string; agentId: string; projectId: string | null; projectName: string | null };
export type CostMembership = { agentId: string; teamId: string; teamName: string; projectId: string; projectName: string | null; departmentId: string | null; departmentName: string | null };
const zero = (): Totals => ({ costCents: 0, costCentsExact: "0.0000000", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, referenceCostCents: 0, reportedCostCents: 0, estimatedCostCents: 0, unpricedEventCount: 0 });
const add = (target: Totals, value: Totals) => {
  target.referenceCostCents = (target.referenceCostCents ?? 0) + (value.referenceCostCents ?? Number(value.reportedCostCents ?? 0) + Number(value.estimatedCostCents ?? 0));
  target.reportedCostCents = (target.reportedCostCents ?? 0) + Number(value.reportedCostCents ?? 0);
  target.estimatedCostCents = (target.estimatedCostCents ?? 0) + Number(value.estimatedCostCents ?? 0);
  target.unpricedEventCount = (target.unpricedEventCount ?? 0) + Number(value.unpricedEventCount ?? 0);
  target.costCentsExact = addCents(target.costCentsExact ?? target.costCents, value.costCentsExact ?? value.costCents);
  target.costCents = Number(target.costCentsExact);
  target.inputTokens += Number(value.inputTokens);
  target.cachedInputTokens += Number(value.cachedInputTokens);
  target.outputTokens += Number(value.outputTokens);
};

/** Each cost aggregate enters each dimension once. Ambiguous membership remains unassigned. */
export function aggregateOrganizationCosts(costs: AttributedCost[], memberships: CostMembership[]) {
  const teams = new Map<string | null, CostByTeam>();
  const departments = new Map<string | null, CostByDepartment>();
  for (const cost of costs) {
    const matches = [...new Map(memberships.filter((member) => member.agentId === cost.agentId && member.projectId === cost.projectId).map((member) => [member.teamId, member])).values()];
    const team = matches.length === 1 ? matches[0] : null;
    const teamId = team?.teamId ?? null;
    let teamRow = teams.get(teamId);
    if (!teamRow) {
      teamRow = { teamId, teamName: team?.teamName ?? null, projectId: team?.projectId ?? null, projectName: team?.projectName ?? null, departmentId: team?.departmentId ?? null, departmentName: team?.departmentName ?? null, ...zero() };
      teams.set(teamId, teamRow);
    }
    add(teamRow, cost);
    const departmentIds = new Set(matches.map((member) => member.departmentId));
    const departmentId = departmentIds.size === 1 ? matches[0]?.departmentId ?? null : null;
    let departmentRow = departments.get(departmentId);
    if (!departmentRow) {
      departmentRow = { departmentId, departmentName: departmentId ? matches[0].departmentName : null, ...zero() };
      departments.set(departmentId, departmentRow);
    }
    add(departmentRow, cost);
  }
  const sort = <T extends Totals>(values: Iterable<T>) => [...values].sort((a, b) => b.costCents - a.costCents);
  return { teams: sort(teams.values()), departments: sort(departments.values()) };
}

/** Stored attribution wins; legacy run links are used only when they identify one project. */
export async function attributedCosts(db: Db, companyId: string, range?: CostDateRange, projectId?: string): Promise<AttributedCost[]> {
  const result = await db.execute(sql`
    WITH run_projects AS (
      SELECT al.run_id, min(i.project_id::text)::uuid AS project_id
      FROM public.activity_log al JOIN public.issues i ON al.entity_type = 'issue' AND al.entity_id = i.id::text AND i.company_id = ${companyId}
      WHERE al.company_id = ${companyId} AND al.run_id IS NOT NULL AND i.project_id IS NOT NULL
      GROUP BY al.run_id HAVING count(DISTINCT i.project_id) = 1
    ), attributed AS (
      SELECT c.*, coalesce(c.project_id, i.project_id, rp.project_id) AS attributed_project_id,
        CASE WHEN nullif(trim(c.model), '') IS NULL OR c.model = 'unknown'
          THEN coalesce(nullif(nullif(trim(hr.usage_json ->> 'model'), ''), 'unknown'), c.model)
          ELSE c.model END AS pricing_model
      FROM public.cost_events c
      LEFT JOIN public.heartbeat_runs hr ON hr.id = c.heartbeat_run_id AND hr.company_id = c.company_id
      LEFT JOIN public.issues i ON i.id = c.issue_id AND i.company_id = c.company_id
      LEFT JOIN run_projects rp ON rp.run_id = c.heartbeat_run_id
      WHERE c.company_id = ${companyId}
        ${range?.from ? sql`AND c.occurred_at >= ${range.from.toISOString()}` : sql``}
        ${range?.to ? sql`AND c.occurred_at <= ${range.to.toISOString()}` : sql``}
    )
    SELECT c.provider, c.model, c.pricing_model AS "pricingModel", c.biller, c.billing_type AS "billingType", c.cost_status AS "costStatus", c.agent_id AS "agentId", p.id AS "projectId", p.name AS "projectName",
      coalesce(sum(c.cost_cents), 0)::double precision AS "costCents",
      coalesce(sum(c.cost_cents), 0)::text AS "costCentsExact",
      coalesce(sum(case when c.cost_status = 'reported' then c.cost_cents else 0 end), 0)::double precision AS "reportedCostCents",
      coalesce(sum(case when c.cost_status::text = 'estimated' then c.cost_cents else 0 end), 0)::double precision AS "estimatedCostCents",
      count(*) filter (where c.cost_status = 'unpriced')::int AS "unpricedEventCount",
      coalesce(sum(c.input_tokens), 0)::double precision AS "inputTokens",
      coalesce(sum(c.cached_input_tokens), 0)::double precision AS "cachedInputTokens",
      coalesce(sum(c.output_tokens), 0)::double precision AS "outputTokens"
    FROM attributed c LEFT JOIN public.projects p ON p.id = c.attributed_project_id AND p.company_id = ${companyId}
    ${projectId ? sql`WHERE p.id = ${projectId}` : sql``}
    GROUP BY c.id, c.agent_id, c.provider, c.model, c.pricing_model, c.biller, c.billing_type, c.cost_status, p.id, p.name
  `);
  return Array.from(result as unknown as Iterable<AttributedCost & { provider: string; model: string; billingType: string; costStatus: string; pricingModel?: string }>).map((row) => {
    const needsEstimate = row.costStatus === "unpriced" || (row.billingType === "subscription_included" && Number(row.costCents) === 0);
    const estimate = needsEstimate ? estimateTokenCostUsd({ ...row, model: row.pricingModel ?? row.model }) : null;
    const estimatedCostCents = estimate ? estimate.costUsd * 100 : Number(row.estimatedCostCents ?? 0);
    const reportedCostCents = Number(row.reportedCostCents ?? 0);
    return { ...row, reportedCostCents, estimatedCostCents, costCents: Number(row.costCents), referenceCostCents: reportedCostCents + estimatedCostCents, unpricedEventCount: needsEstimate && !estimate ? 1 : 0 };
  });
}

export async function organizationCosts(db: Db, companyId: string, range?: CostDateRange, projectId?: string) {
  const namespace = derivePluginDatabaseNamespace("paperclip-improvement-teams", "improvement_teams");
  const table = (name: string) => sql.raw(`"${namespace}"."${name}"`);
  const [costs, availabilityRows] = await Promise.all([
    attributedCosts(db, companyId, range, projectId),
    db.execute(sql`SELECT to_regclass(${namespace + ".teams"}) IS NOT NULL AND to_regclass(${namespace + ".team_members"}) IS NOT NULL AND to_regclass(${namespace + ".departments"}) IS NOT NULL AS available`),
  ]);
  const availability = Array.from(availabilityRows as unknown as Iterable<{ available: boolean }>);
  if (!availability[0]?.available) return aggregateOrganizationCosts(costs, []);
  const result = await db.execute(sql`
    SELECT m.agent_id AS "agentId", t.id AS "teamId", t.name AS "teamName", t.project_id AS "projectId", p.name AS "projectName", d.id AS "departmentId", d.name AS "departmentName"
    FROM ${table("teams")} t
    JOIN ${table("team_members")} m ON m.team_id = t.id AND m.company_id = t.company_id AND m.project_id = t.project_id AND m.member_revision = t.member_revision
    JOIN public.agents a ON a.id = m.agent_id AND a.company_id = t.company_id
    JOIN public.projects p ON p.id = t.project_id AND p.company_id = t.company_id
    LEFT JOIN ${table("departments")} d ON d.id = t.department_id AND d.company_id = t.company_id
    WHERE t.company_id = ${companyId} ${projectId ? sql`AND t.project_id = ${projectId}` : sql``}
  `);
  return aggregateOrganizationCosts(costs, Array.from(result as unknown as Iterable<CostMembership>));
}

export async function projectCosts(db: Db, companyId: string, range?: CostDateRange, projectId?: string): Promise<CostByProject[]> {
  const rows = new Map<string | null, CostByProject>();
  for (const cost of await attributedCosts(db, companyId, range, projectId)) {
    let row = rows.get(cost.projectId);
    if (!row) { row = { projectId: cost.projectId, projectName: cost.projectName, ...zero() }; rows.set(cost.projectId, row); }
    add(row, cost);
  }
  return [...rows.values()].sort((a, b) => b.costCents - a.costCents);
}
