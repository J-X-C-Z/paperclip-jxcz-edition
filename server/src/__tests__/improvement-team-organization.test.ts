import { randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { improvementTeamOrganizationService } from "../services/improvement-team-organization.js";

const companyId = randomUUID(), projectId = randomUUID();
const leadId = randomUUID(), memberId = randomUUID(), headId = randomUUID(), teamId = randomUUID(), departmentId = randomUUID();
function fixture(options: { headStatus?: string; headReportsTo?: string; existingDepartment?: boolean; failMembership?: boolean; conflictingLead?: boolean } = {}) {
  const agents = [
    { id: leadId, role: "general", status: "idle", reports_to: null, metadata: { agentTemplate: { id: "team-leader", version: 1, role: "leader" } } },
    { id: memberId, role: "general", status: "idle", reports_to: headId, metadata: { agentTemplate: { id: "team-member", version: 1, role: "member" } } },
    { id: headId, role: "general", status: options.headStatus ?? "idle", reports_to: options.headReportsTo ?? null, metadata: { agentTemplate: { id: "department-head", version: 1, role: "department_head" } } },
  ];
  const writes: { sql: string; params: unknown[] }[] = [];
  let committed = false;
  const db = { transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
    const pending: typeof writes = [];
    const result = await operation({ execute: async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const query = new PgDialect().sqlToQuery(statement);
      if (query.sql.startsWith("SELECT")) {
        if (query.sql.includes("FROM public.companies")) return [{ id: companyId }];
        if (query.sql.includes("FROM public.agents")) return agents;
        if (query.sql.includes('FROM "plugin_improvement_teams_5ea92c3b34"."teams"')) return [{ id: teamId, name: "Team", project_id: projectId, department_id: options.existingDepartment ? departmentId : null }, ...(options.conflictingLead ? [{ id: "other-team", department_id: "other-department" }] : [])];
        if (query.sql.includes('FROM "plugin_improvement_teams_5ea92c3b34"."departments"')) return [{ id: departmentId, name: "Engineering", head_agent_id: headId }, ...(options.conflictingLead ? [{ id: "other-department", head_agent_id: memberId }] : [])];
        if (query.sql.includes('FROM "plugin_improvement_teams_5ea92c3b34"."team_members"')) return [{ team_id: teamId, agent_id: leadId, role: "team_lead" }, ...(options.conflictingLead ? [{ team_id: "other-team", agent_id: leadId, role: "team_lead" }] : [])];
        if (query.sql.includes("FROM public.projects")) return query.params[0] === projectId ? [{ id: projectId }] : [];
        throw new Error(query.sql);
      }
      if (options.failMembership && query.sql.startsWith('INSERT INTO "plugin_improvement_teams_5ea92c3b34"."team_members"')) throw new Error("membership insert failed");
      pending.push(query);
      return [];
    } });
    writes.push(...pending); committed = true; return result;
  } } as unknown as Db;
  return { service: improvementTeamOrganizationService(db), agents, writes, committed: () => committed };
}

describe("native improvement team organization saves", () => {
  it("saves a department and changes its selected team lead to report to the head within one transaction", async () => {
    const state = fixture();
    await state.service.save("save-department", { companyId, departmentId, name: "Engineering", headAgentId: headId, teamIds: [teamId] });
    expect(state.writes.find(write => write.sql.startsWith("UPDATE public.agents"))?.params).toEqual([headId, leadId, companyId]);
    expect(state.committed()).toBe(true);
  });
  it("saves the complete membership plus department selection and synchronizes member and lead reporting", async () => {
    const state = fixture();
    const result = await state.service.save("save-team", { companyId, projectId, teamId, name: "Team", departmentId, memberAgentIds: [leadId, memberId], leadAgentId: leadId });
    expect(result).toEqual({ teamId, leadAgentId: leadId, departmentId });
    expect(state.writes.filter(write => write.sql.startsWith("UPDATE public.agents")).map(write => write.params)).toEqual([[leadId, memberId, companyId], [headId, leadId, companyId]]);
  });
  it("rejects reporting cycles before any organization or native writes", async () => {
    const state = fixture({ headReportsTo: leadId });
    await expect(state.service.save("save-department", { companyId, departmentId, name: "Engineering", headAgentId: headId, teamIds: [teamId] })).rejects.toThrow("cycle");
    expect(state.writes).toEqual([]);
    expect(state.committed()).toBe(false);
  });
  it("rejects assigning a shared team lead to two different department heads", async () => {
    const state = fixture({ conflictingLead: true });
    await expect(state.service.save("save-department", { companyId, departmentId, name: "Engineering", headAgentId: headId, teamIds: [teamId] })).rejects.toThrow("different reporting heads");
    expect(state.writes).toEqual([]);
  });
  it("rolls back reporting and team updates when membership cannot be saved", async () => {
    const state = fixture({ failMembership: true });
    await expect(state.service.save("save-team", { companyId, projectId, teamId, name: "Team", memberAgentIds: [leadId, memberId], leadAgentId: leadId })).rejects.toThrow("membership insert failed");
    expect(state.writes).toEqual([]);
    expect(state.committed()).toBe(false);
  });
  it("rejects unavailable template managers and company external members without writes", async () => {
    const state = fixture({ headStatus: "paused" });
    await expect(state.service.save("save-department", { companyId, departmentId, name: "Engineering", headAgentId: headId, teamIds: [teamId] })).rejects.toThrow("active manager");
    await expect(state.service.save("save-team", { companyId, projectId, teamId, name: "Team", memberAgentIds: [randomUUID()] })).rejects.toThrow("existing agent in this company");
    expect(state.writes).toEqual([]);
  });
  it("clears only a former automatic head edge when removing a team from a department", async () => {
    const state = fixture({ existingDepartment: true });
    state.agents[0]!.reports_to = headId;
    await state.service.save("save-team", { companyId, projectId, teamId, name: "Team", departmentId: null, memberAgentIds: [leadId], leadAgentId: leadId });
    expect(state.writes.find(write => write.sql.startsWith("UPDATE public.agents"))?.params).toEqual([null, leadId, companyId]);
    const manual = fixture({ existingDepartment: true });
    await manual.service.save("save-team", { companyId, projectId, teamId, name: "Team", departmentId: null, memberAgentIds: [leadId], leadAgentId: leadId });
    expect(manual.writes.some(write => write.sql.startsWith("UPDATE public.agents"))).toBe(false);
  });
  it("clears the former automatic head edge when a department removes its group or head", async () => {
    for (const patch of [{ teamIds: [], headAgentId: headId }, { teamIds: [teamId], headAgentId: null }]) {
      const state = fixture({ existingDepartment: true });
      state.agents[0]!.reports_to = headId;
      await state.service.save("save-department", { companyId, departmentId, name: "Engineering", ...patch });
      expect(state.writes.find(write => write.sql.startsWith("UPDATE public.agents"))?.params).toEqual([null, leadId, companyId]);
    }
  });
  it("preserves a team's department when selection is omitted", async () => {
    const state = fixture({ existingDepartment: true });
    const result = await state.service.save("save-team", { companyId, projectId, teamId, name: "Team", memberAgentIds: [leadId], leadAgentId: leadId });
    expect(result).toMatchObject({ departmentId });
  });
});
