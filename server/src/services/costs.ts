import { agentAvatarUrl, resolveAgentAppearance } from "@paperclipai/shared";
import { and, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import { activityLog, agents, companies, costAccountingResiduals, costEvents, goals, heartbeatRuns, issues, projects } from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";
import { budgetService, type BudgetServiceHooks } from "./budgets.js";
import { settleUsdMicros, utcAccountingMonth } from "./bridge-money.js";
import { logActivity, publishActivity, type ActivityPublication, type LogActivityInput } from "./activity-log.js";
import { attributedCosts, organizationCosts, projectCosts, type AttributedCost } from "./cost-organization.js";
import { visibleIssueCondition } from "./issue-visibility.js";

export interface CostDateRange {
  from?: Date;
  to?: Date;
}

export type CostDbExecutor = Pick<Db, "select" | "insert" | "update" | "execute">;
export type CostTransactionOptions = {
  tx?: CostDbExecutor;
  billedUsdMicros?: string;
  precisionSource?: string;
  accountingBinding?: string;
  accountingOwner?: "paperclip" | "adapter";
  actor?: Omit<LogActivityInput, "companyId" | "action" | "entityType" | "entityId" | "details">;
  postCommitPublications?: ActivityPublication[];
};

const METERED_BILLING_TYPE = "metered_api";
const SUBSCRIPTION_BILLING_TYPES = ["subscription_included", "subscription_overage"] as const;

function sumAsNumber(column: typeof costEvents.costCents | typeof costEvents.inputTokens | typeof costEvents.cachedInputTokens | typeof costEvents.outputTokens) {
  return sql<number>`coalesce(sum(${column}), 0)::double precision`;
}

/** Attach the same fractional-cent reference totals to every display dimension.
 * The integer ledger and budget accounting remain incremental billed spend. */
export function attachReferenceCosts<T extends { costCents: number }>(
  rows: T[], costs: AttributedCost[], rowKey: (row: T) => string, costKey: (row: AttributedCost) => string,
) {
  const totals = new Map<string, { costCents: number; reportedCostCents: number; estimatedCostCents: number; unpricedEventCount: number }>();
  for (const cost of costs) {
    const key = costKey(cost);
    const total = totals.get(key) ?? { costCents: 0, reportedCostCents: 0, estimatedCostCents: 0, unpricedEventCount: 0 };
    total.costCents += cost.costCents;
    total.reportedCostCents += cost.reportedCostCents ?? 0;
    total.estimatedCostCents += cost.estimatedCostCents ?? 0;
    total.unpricedEventCount += cost.unpricedEventCount ?? 0;
    totals.set(key, total);
  }
  return rows.map((row) => ({ ...row, ...totals.get(rowKey(row)) })).sort((a, b) => b.costCents - a.costCents);
}

/** Match the stored/issue/unambiguous-run attribution used by attributedCosts. */
function projectCostCondition(companyId: string, projectId: string) {
  return sql`coalesce(${costEvents.projectId},
    (SELECT i.project_id FROM public.issues i WHERE i.id = ${costEvents.issueId} AND i.company_id = ${companyId}),
    (SELECT min(i.project_id::text)::uuid FROM public.activity_log al
      JOIN public.issues i ON al.entity_type = 'issue' AND al.entity_id = i.id::text AND i.company_id = ${companyId}
      WHERE al.company_id = ${companyId} AND al.run_id = ${costEvents.heartbeatRunId} AND i.project_id IS NOT NULL
      HAVING count(DISTINCT i.project_id) = 1)) = ${projectId}`;
}

function currentUtcMonthWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
}

export async function getMonthlySpendTotal(
  db: Db,
  scope: { companyId: string; agentId?: string | null },
) {
  const { start, end } = currentUtcMonthWindow();
  const conditions = [
    eq(costEvents.companyId, scope.companyId),
    gte(costEvents.occurredAt, start),
    lt(costEvents.occurredAt, end),
  ];
  if (scope.agentId) {
    conditions.push(eq(costEvents.agentId, scope.agentId));
  }
  const [row] = await db
    .select({
      total: sumAsNumber(costEvents.costCents),
    })
    .from(costEvents)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export function costService(db: Db, budgetHooks: BudgetServiceHooks = {}) {
  async function recordEvent(client: CostDbExecutor, companyId: string, data: Omit<typeof costEvents.$inferInsert, "companyId">,
    options: CostTransactionOptions = {}) {
    const company = await client.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).then((rows) => rows[0] ?? null);
    if (!company) throw notFound("Company not found");
    const agent = await client.select().from(agents).where(eq(agents.id, data.agentId)).then((rows) => rows[0] ?? null);
    if (!agent) throw notFound("Agent not found");
    if (agent.companyId !== companyId) throw unprocessable("Agent does not belong to company");
    if (data.projectId) {
      const project = await client.select({ companyId: projects.companyId }).from(projects).where(eq(projects.id, data.projectId)).then((rows) => rows[0] ?? null);
      if (!project || project.companyId !== companyId) throw unprocessable("Project does not belong to company");
    }
    if (data.issueId) {
      const issue = await client.select({ companyId: issues.companyId }).from(issues).where(eq(issues.id, data.issueId)).then((rows) => rows[0] ?? null);
      if (!issue || issue.companyId !== companyId) throw unprocessable("Issue does not belong to company");
    }
    if (data.heartbeatRunId) {
      const run = await client.select({ companyId: heartbeatRuns.companyId }).from(heartbeatRuns).where(eq(heartbeatRuns.id, data.heartbeatRunId)).then((rows) => rows[0] ?? null);
      if (!run || run.companyId !== companyId) throw unprocessable("Heartbeat run does not belong to company");
    }
    if (data.goalId) {
      const goal = await client.select({ companyId: goals.companyId }).from(goals).where(eq(goals.id, data.goalId)).then((rows) => rows[0] ?? null);
      if (!goal || goal.companyId !== companyId) throw unprocessable("Goal does not belong to company");
    }
    // Global lock order: company, agent, project, then binding/month residual.
    await client.execute(sql`select id from ${companies} where id = ${companyId} for update`);
    await client.execute(sql`select id from ${agents} where id = ${data.agentId} for update`);
    if (data.projectId) await client.execute(sql`select id from public.projects where id = ${data.projectId} for update`);
    const occurredAt = data.occurredAt;
    const accountingMonth = utcAccountingMonth(occurredAt);
    const binding = options.accountingBinding ?? data.billingCode ?? `${data.provider}:${data.biller ?? "unknown"}`;
    await client.insert(costAccountingResiduals).values({ companyId, binding, accountingMonth, residualMicros: 0n })
      .onConflictDoNothing();
    await client.execute(sql`select company_id from public.cost_accounting_residuals where company_id = ${companyId} and binding = ${binding} and accounting_month = ${accountingMonth} for update`);
    const [residualRow] = await client.select().from(costAccountingResiduals).where(and(
      eq(costAccountingResiduals.companyId, companyId), eq(costAccountingResiduals.binding, binding),
      eq(costAccountingResiduals.accountingMonth, accountingMonth),
    ));
    const micros = options.billedUsdMicros ?? String(BigInt(data.costCents) * 10_000n);
    const residual = String(residualRow?.residualMicros ?? 0n);
    const settled = options.accountingOwner === "adapter"
      ? { costCents: data.costCents, residualMicros: residual }
      : settleUsdMicros(residual, micros);
    const event = await client.insert(costEvents).values({
      ...data, companyId, costCents: settled.costCents, billedUsdMicros: BigInt(micros),
      costPrecisionSource: options.precisionSource ?? "legacy_cents", biller: data.biller ?? data.provider,
      billingType: data.billingType ?? "unknown", cachedInputTokens: data.cachedInputTokens ?? 0,
    }).returning().then((rows) => rows[0]);
    await client.update(costAccountingResiduals).set({ residualMicros: BigInt(settled.residualMicros), updatedAt: new Date() })
      .where(and(eq(costAccountingResiduals.companyId, companyId), eq(costAccountingResiduals.binding, binding), eq(costAccountingResiduals.accountingMonth, accountingMonth)));
    const monthStart = new Date(Date.UTC(Number(accountingMonth.slice(0, 4)), Number(accountingMonth.slice(5, 7)) - 1, 1));
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const isCurrentMonth = utcAccountingMonth(new Date()) === accountingMonth && options.accountingOwner !== "adapter";
    if (isCurrentMonth) {
      const [agentSpend, companySpend] = await Promise.all([
        client.select({ total: sumAsNumber(costEvents.costCents) }).from(costEvents).where(and(eq(costEvents.companyId, companyId), eq(costEvents.agentId, event.agentId), gte(costEvents.occurredAt, monthStart), lt(costEvents.occurredAt, monthEnd))).then((rows) => rows[0]?.total ?? 0),
        client.select({ total: sumAsNumber(costEvents.costCents) }).from(costEvents).where(and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, monthStart), lt(costEvents.occurredAt, monthEnd))).then((rows) => rows[0]?.total ?? 0),
      ]);
      await client.update(agents).set({ spentMonthlyCents: Number(agentSpend), updatedAt: new Date() }).where(eq(agents.id, data.agentId));
      await client.update(companies).set({ spentMonthlyCents: Number(companySpend), updatedAt: new Date() }).where(eq(companies.id, companyId));
      await budgetService(client as Db, { ...budgetHooks, postCommitPublications: options.postCommitPublications }).evaluateCostEvent(event);
    }
    const publicationBuffer = options.postCommitPublications ?? [];
    await logActivity(client as Db, {
      companyId, actorType: options.actor?.actorType ?? "system", actorId: options.actor?.actorId ?? "cost_service",
      agentId: options.actor ? options.actor.agentId : event.agentId,
      runId: options.actor ? options.actor.runId : event.heartbeatRunId,
      action: "cost.reported", entityType: "cost_event", entityId: event.id,
      details: { costCents: event.costCents, billedUsdMicros: micros, precisionSource: event.costPrecisionSource, model: event.model },
    }, publicationBuffer);
    return event;
  }
  return {
    createEvent: async (companyId: string, data: Omit<typeof costEvents.$inferInsert, "companyId" | "billedUsdMicros" | "costPrecisionSource">,
      options: CostTransactionOptions = {}) => {
      if (options.tx) {
        if (!options.postCommitPublications) {
          throw new Error("postCommitPublications is required when recording a cost inside an external transaction");
        }
        return recordEvent(options.tx, companyId, data, options);
      }
      const publications: ActivityPublication[] = [];
      const event = await db.transaction((tx) => recordEvent(tx as CostDbExecutor, companyId, data, { ...options, postCommitPublications: publications }));
      for (const publication of publications) publishActivity(publication);
      return event;
    },

    summary: async (companyId: string, range?: CostDateRange, projectId?: string) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (projectId) conditions.push(projectCostCondition(companyId, projectId));
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const [totalRows, attributed] = await Promise.all([
        db
          .select({
            total: sumAsNumber(costEvents.costCents),
          })
          .from(costEvents)
          .where(and(...conditions)),
        attributedCosts(db, companyId, range, projectId),
      ]);
      const [{ total }] = totalRows;
      const reportedCostCents = attributed.reduce((sum, row) => sum + (row.reportedCostCents ?? 0), 0);
      const estimatedCostCents = attributed.reduce((sum, row) => sum + (row.estimatedCostCents ?? 0), 0);
      const unpricedEventCount = attributed.reduce((sum, row) => sum + (row.unpricedEventCount ?? 0), 0);
      const spendCents = Number(total);
      const utilization =
        !projectId && company.budgetMonthlyCents > 0
          ? (spendCents / company.budgetMonthlyCents) * 100
          : 0;

      return {
        companyId,
        ...(projectId ? { projectId } : {}),
        spendCents,
        referenceCostCents: reportedCostCents + estimatedCostCents,
        reportedCostCents: Number(reportedCostCents ?? 0),
        estimatedCostCents: Number(estimatedCostCents ?? 0),
        unpricedEventCount: Number(unpricedEventCount ?? 0),
        trackingEnabled: true,
        budgetCents: projectId ? 0 : company.budgetMonthlyCents,
        utilizationPercent: Number(utilization.toFixed(2)),
      };
    },

    issueTreeSummary: async (
      companyId: string,
      issueId: string,
      options: { excludeRoot?: boolean } = {},
    ) => {
      // Callers must resolve and authorize a visible root issue before invoking this.
      // The route does that so zero counts are not mistaken for a missing root.
      const childIssues = alias(issues, "child");

      // The seed of the recursive CTE: when excludeRoot is true, start from
      // the direct children so the root issue itself is not counted.
      const cteSeed = options.excludeRoot
        ? sql`
            SELECT ${issues.id}
            FROM ${issues}
            WHERE ${issues.companyId} = ${companyId}
              AND ${issues.parentId} = ${issueId}
              AND ${issues.hiddenAt} IS NULL
              AND ${issues.harnessKind} IS NULL
          `
        : sql`
            SELECT ${issues.id}
            FROM ${issues}
            WHERE ${issues.companyId} = ${companyId}
              AND ${issues.id} = ${issueId}
              AND ${issues.hiddenAt} IS NULL
              AND ${issues.harnessKind} IS NULL
          `;

      const cteSeedText = options.excludeRoot
        ? sql`
            SELECT (${issues.id})::text AS id
            FROM ${issues}
            WHERE ${issues.companyId} = ${companyId}
              AND ${issues.parentId} = ${issueId}
              AND ${issues.hiddenAt} IS NULL
              AND ${issues.harnessKind} IS NULL
          `
        : sql`
            SELECT (${issues.id})::text AS id
            FROM ${issues}
            WHERE ${issues.companyId} = ${companyId}
              AND ${issues.id} = ${issueId}
              AND ${issues.hiddenAt} IS NULL
              AND ${issues.harnessKind} IS NULL
          `;

      const issueTreeCondition = sql<boolean>`
        ${issues.id} IN (
          WITH RECURSIVE issue_tree(id) AS (
            ${cteSeed}
            UNION ALL
            SELECT ${childIssues.id}
            FROM ${issues} ${childIssues}
            JOIN issue_tree ON ${childIssues.parentId} = issue_tree.id
            WHERE ${childIssues.companyId} = ${companyId}
              AND ${childIssues.hiddenAt} IS NULL
              AND ${childIssues.harnessKind} IS NULL
          )
          SELECT id FROM issue_tree
        )
      `;

      const runSummarySql = sql`
        WITH RECURSIVE issue_tree(id) AS (
          ${cteSeedText}
          UNION ALL
          SELECT (${childIssues.id})::text
          FROM ${issues} ${childIssues}
          JOIN issue_tree ON (${childIssues.parentId})::text = issue_tree.id
          WHERE ${childIssues.companyId} = ${companyId}
            AND ${childIssues.hiddenAt} IS NULL
            AND ${childIssues.harnessKind} IS NULL
        )
        SELECT
          count(distinct ${heartbeatRuns.id})::int AS "runCount",
          coalesce(sum(extract(epoch from (coalesce(${heartbeatRuns.finishedAt}, now()) - ${heartbeatRuns.startedAt})) * 1000), 0)::double precision AS "runtimeMs"
        FROM ${heartbeatRuns}
        WHERE ${heartbeatRuns.companyId} = ${companyId}
          AND ${heartbeatRuns.startedAt} IS NOT NULL
          AND (
            ${heartbeatRuns.contextSnapshot} ->> 'issueId' IN (SELECT id FROM issue_tree)
            OR EXISTS (
              SELECT 1
              FROM ${activityLog}
              JOIN issue_tree ON ${activityLog.entityId} = issue_tree.id
              WHERE ${activityLog.companyId} = ${companyId}
                AND ${activityLog.entityType} = 'issue'
                AND ${activityLog.runId} = ${heartbeatRuns.id}
            )
          )
      `;

      // Run cost-event aggregation and run-duration aggregation in parallel.
      // They're separate queries because cost_events fan out per-event and
      // joining heartbeat_runs through them would double-count run durations.
      const [costRowResult, runRowResult] = await Promise.all([
        db
          .select({
            issueCount: sql<number>`count(distinct ${issues.id})::int`,
            costCents: sumAsNumber(costEvents.costCents),
            inputTokens: sumAsNumber(costEvents.inputTokens),
            cachedInputTokens: sumAsNumber(costEvents.cachedInputTokens),
            outputTokens: sumAsNumber(costEvents.outputTokens),
          })
          .from(issues)
          .leftJoin(
            costEvents,
            and(
              eq(costEvents.companyId, companyId),
              eq(costEvents.issueId, issues.id),
            ),
          )
          .where(
            and(
              eq(issues.companyId, companyId),
              visibleIssueCondition(),
              issueTreeCondition,
            ),
          ),
        db.execute(runSummarySql),
      ]);

      const costRow = costRowResult[0];
      const runRow = Array.isArray(runRowResult)
        ? (runRowResult[0] as { runCount?: number | string | null; runtimeMs?: number | string | null } | undefined)
        : undefined;

      return {
        issueId,
        issueCount: Number(costRow?.issueCount ?? 0),
        includeDescendants: true,
        costCents: Number(costRow?.costCents ?? 0),
        inputTokens: Number(costRow?.inputTokens ?? 0),
        cachedInputTokens: Number(costRow?.cachedInputTokens ?? 0),
        outputTokens: Number(costRow?.outputTokens ?? 0),
        runCount: Number(runRow?.runCount ?? 0),
        runtimeMs: Number(runRow?.runtimeMs ?? 0),
      };
    },

    byAgent: async (companyId: string, range?: CostDateRange, projectId?: string) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (projectId) conditions.push(projectCostCondition(companyId, projectId));
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const [rows, attributed] = await Promise.all([
        db
          .select({
            agentId: costEvents.agentId,
            agentName: agents.name,
            agentAppearance: agents.appearance,
            agentStatus: agents.status,
            costCents: sumAsNumber(costEvents.costCents),
            inputTokens: sumAsNumber(costEvents.inputTokens),
            cachedInputTokens: sumAsNumber(costEvents.cachedInputTokens),
            outputTokens: sumAsNumber(costEvents.outputTokens),
            apiRunCount:
              sql<number>`count(distinct case when ${costEvents.billingType} = ${METERED_BILLING_TYPE} then ${costEvents.heartbeatRunId} end)::int`,
            subscriptionRunCount:
              sql<number>`count(distinct case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.heartbeatRunId} end)::int`,
            subscriptionCachedInputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.cachedInputTokens} else 0 end), 0)::double precision`,
            subscriptionInputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.inputTokens} else 0 end), 0)::double precision`,
            subscriptionOutputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.outputTokens} else 0 end), 0)::double precision`,
          })
          .from(costEvents)
          .leftJoin(agents, eq(costEvents.agentId, agents.id))
          .where(and(...conditions))
          .groupBy(costEvents.agentId, agents.name, agents.appearance, agents.status)
          .orderBy(desc(sumAsNumber(costEvents.costCents))),
        attributedCosts(db, companyId, range, projectId),
      ]);
      return attachReferenceCosts(rows, attributed, (row) => JSON.stringify([row.agentId]), (row) => JSON.stringify([row.agentId])).map(row => {
        const appearance = resolveAgentAppearance(row.agentAppearance, row.agentId);
        return { ...row, agentAppearance: appearance, avatarUrl: agentAvatarUrl(appearance, 512) };
      });
    },

    byProvider: async (companyId: string, range?: CostDateRange, projectId?: string) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (projectId) conditions.push(projectCostCondition(companyId, projectId));
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const [rows, attributed] = await Promise.all([
        db
          .select({
            provider: costEvents.provider,
            biller: costEvents.biller,
            billingType: costEvents.billingType,
            model: costEvents.model,
            costCents: sumAsNumber(costEvents.costCents),
            inputTokens: sumAsNumber(costEvents.inputTokens),
            cachedInputTokens: sumAsNumber(costEvents.cachedInputTokens),
            outputTokens: sumAsNumber(costEvents.outputTokens),
            apiRunCount:
              sql<number>`count(distinct case when ${costEvents.billingType} = ${METERED_BILLING_TYPE} then ${costEvents.heartbeatRunId} end)::int`,
            subscriptionRunCount:
              sql<number>`count(distinct case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.heartbeatRunId} end)::int`,
            subscriptionCachedInputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.cachedInputTokens} else 0 end), 0)::double precision`,
            subscriptionInputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.inputTokens} else 0 end), 0)::double precision`,
            subscriptionOutputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.outputTokens} else 0 end), 0)::double precision`,
          })
          .from(costEvents)
          .where(and(...conditions))
          .groupBy(costEvents.provider, costEvents.biller, costEvents.billingType, costEvents.model)
          .orderBy(desc(sumAsNumber(costEvents.costCents))),
        attributedCosts(db, companyId, range, projectId),
      ]);
      return attachReferenceCosts(rows, attributed, (row) => JSON.stringify([row.provider, row.biller, row.billingType, row.model]), (row) => JSON.stringify([row.provider, row.biller, row.billingType, row.model]));
    },

    byBiller: async (companyId: string, range?: CostDateRange, projectId?: string) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (projectId) conditions.push(projectCostCondition(companyId, projectId));
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const [rows, attributed] = await Promise.all([
        db
          .select({
            biller: costEvents.biller,
            costCents: sumAsNumber(costEvents.costCents),
            inputTokens: sumAsNumber(costEvents.inputTokens),
            cachedInputTokens: sumAsNumber(costEvents.cachedInputTokens),
            outputTokens: sumAsNumber(costEvents.outputTokens),
            apiRunCount:
              sql<number>`count(distinct case when ${costEvents.billingType} = ${METERED_BILLING_TYPE} then ${costEvents.heartbeatRunId} end)::int`,
            subscriptionRunCount:
              sql<number>`count(distinct case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.heartbeatRunId} end)::int`,
            subscriptionCachedInputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.cachedInputTokens} else 0 end), 0)::double precision`,
            subscriptionInputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.inputTokens} else 0 end), 0)::double precision`,
            subscriptionOutputTokens:
              sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.outputTokens} else 0 end), 0)::double precision`,
            providerCount: sql<number>`count(distinct ${costEvents.provider})::int`,
            modelCount: sql<number>`count(distinct ${costEvents.model})::int`,
          })
          .from(costEvents)
          .where(and(...conditions))
          .groupBy(costEvents.biller)
          .orderBy(desc(sumAsNumber(costEvents.costCents))),
        attributedCosts(db, companyId, range, projectId),
      ]);
      return attachReferenceCosts(rows, attributed, (row) => JSON.stringify([row.biller]), (row) => JSON.stringify([row.biller]));
    },

    /**
     * aggregates cost_events by provider for each of three rolling windows:
     * last 5 hours, last 24 hours, last 7 days.
     * purely internal consumption data, no external rate-limit sources.
     */
    windowSpend: async (companyId: string, projectId?: string) => {
      const windows = [
        { label: "5h", hours: 5 },
        { label: "24h", hours: 24 },
        { label: "7d", hours: 168 },
      ] as const;

      const results = await Promise.all(
        windows.map(async ({ label, hours }) => {
          const since = new Date(Date.now() - hours * 60 * 60 * 1000);
          const [rows, attributed] = await Promise.all([
            db
              .select({
                provider: costEvents.provider,
                biller: sql<string>`case when count(distinct ${costEvents.biller}) = 1 then min(${costEvents.biller}) else 'mixed' end`,
                costCents: sumAsNumber(costEvents.costCents),
                inputTokens: sumAsNumber(costEvents.inputTokens),
                cachedInputTokens: sumAsNumber(costEvents.cachedInputTokens),
                outputTokens: sumAsNumber(costEvents.outputTokens),
              })
              .from(costEvents)
              .where(
                and(
                  eq(costEvents.companyId, companyId),
                  gte(costEvents.occurredAt, since),
                  projectId ? projectCostCondition(companyId, projectId) : undefined,
                ),
              )
              .groupBy(costEvents.provider)
              .orderBy(desc(sumAsNumber(costEvents.costCents))),
            attributedCosts(db, companyId, { from: since }, projectId),
          ]);

          const references = attachReferenceCosts(rows, attributed, (row) => row.provider, (row) => row.provider ?? "unknown");
          return references.map((row) => ({
            provider: row.provider,
            biller: row.biller,
            window: label as string,
            windowHours: hours,
            costCents: row.costCents,
            reportedCostCents: row.reportedCostCents,
            estimatedCostCents: row.estimatedCostCents,
            unpricedEventCount: row.unpricedEventCount,
            inputTokens: row.inputTokens,
            cachedInputTokens: row.cachedInputTokens,
            outputTokens: row.outputTokens,
          }));
        }),
      );

      return results.flat();
    },

    byAgentModel: async (companyId: string, range?: CostDateRange, projectId?: string) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (projectId) conditions.push(projectCostCondition(companyId, projectId));
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      // single query: group by agent + provider + model.
      // the (companyId, agentId, occurredAt) composite index covers this well.
      // order by provider + model for stable db-level ordering; cost-desc sort
      // within each agent's sub-rows is done client-side in the ui memo.
      const [rows, attributed] = await Promise.all([
        db
          .select({
            agentId: costEvents.agentId,
            agentName: agents.name,
            agentAppearance: agents.appearance,
            provider: costEvents.provider,
            biller: costEvents.biller,
            billingType: costEvents.billingType,
            model: costEvents.model,
            costCents: sumAsNumber(costEvents.costCents),
            inputTokens: sumAsNumber(costEvents.inputTokens),
            cachedInputTokens: sumAsNumber(costEvents.cachedInputTokens),
            outputTokens: sumAsNumber(costEvents.outputTokens),
          })
          .from(costEvents)
          .leftJoin(agents, eq(costEvents.agentId, agents.id))
          .where(and(...conditions))
          .groupBy(
            costEvents.agentId,
            agents.name,
            agents.appearance,
            costEvents.provider,
            costEvents.biller,
            costEvents.billingType,
            costEvents.model,
          )
          .orderBy(costEvents.provider, costEvents.biller, costEvents.billingType, costEvents.model),
        attributedCosts(db, companyId, range, projectId),
      ]);
      return attachReferenceCosts(rows, attributed, (row) => JSON.stringify([row.agentId, row.provider, row.biller, row.billingType, row.model]), (row) => JSON.stringify([row.agentId, row.provider, row.biller, row.billingType, row.model])).map(row => {
        const appearance = resolveAgentAppearance(row.agentAppearance, row.agentId);
        return { ...row, agentAppearance: appearance, avatarUrl: agentAvatarUrl(appearance, 512) };
      });
    },

    byProject: (companyId: string, range?: CostDateRange, projectId?: string) => projectCosts(db, companyId, range, projectId),
    byTeam: async (companyId: string, range?: CostDateRange, projectId?: string) => (await organizationCosts(db, companyId, range, projectId)).teams,
    byDepartment: async (companyId: string, range?: CostDateRange, projectId?: string) => (await organizationCosts(db, companyId, range, projectId)).departments,
  };
}
