import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assertTemplateManager } from "./agent-templates.js";
import { derivePluginDatabaseNamespace } from "./plugin-database.js";

export const IMPROVEMENT_TEAMS_PLUGIN_KEY = "paperclip-improvement-teams";
export const IMPROVEMENT_ORGANIZATION_ACTIONS = new Set(["save-department", "save-team"]);
type Row = Record<string, unknown>;
type Client = { execute: (statement: SQL) => Promise<unknown> };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
const role = (agent: Row) => (agent.metadata as Row | null)?.agentTemplate as Row | undefined;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const inactive = (agent: Row) => ["terminated", "pending_approval"].includes(String(agent.status));
async function rows(tx: Client, query: SQL): Promise<Row[]> { return Array.from(await tx.execute(query) as Iterable<Row>); }

/** Only these two board actions can atomically edit native reporting lines.
 * Plugin SQL continues to have no write access to any public core table. */
export function improvementTeamOrganizationService(db: Db) {
  const ns = derivePluginDatabaseNamespace(IMPROVEMENT_TEAMS_PLUGIN_KEY, "improvement_teams");
  const table = (name: string) => sql.raw(`"${ns}"."${name}"`);
  return {
    async save(action: string, params: Row) {
      if (!IMPROVEMENT_ORGANIZATION_ACTIONS.has(action)) throw new Error("Unsupported organization action");
      const companyId = text(params.companyId), name = text(params.name).slice(0, 120);
      if (!uuid(companyId)) throw new Error("companyId is required");
      if (!name) throw new Error(action === "save-team" ? "Team name is required" : "Department name is required");
      return db.transaction(async (tx) => {
        if (!(await rows(tx, sql`SELECT id FROM public.companies WHERE id = ${companyId} FOR UPDATE`)).length) throw new Error("Company not found");
        // All organization saves use this lock order. A complete company graph
        // is locked before reading and validating proposed reporting edges.
        const agents = await rows(tx, sql`SELECT id, company_id, role, reports_to, status, metadata FROM public.agents WHERE company_id = ${companyId} ORDER BY id FOR UPDATE`);
        const teams = await rows(tx, sql`SELECT id, name, project_id, department_id, member_revision FROM ${table("teams")} WHERE company_id = ${companyId} ORDER BY id FOR UPDATE`);
        const departments = await rows(tx, sql`SELECT id, name, head_agent_id FROM ${table("departments")} WHERE company_id = ${companyId} ORDER BY id FOR UPDATE`);
        const memberships = await rows(tx, sql`SELECT m.team_id, m.agent_id, m.role FROM ${table("team_members")} m JOIN ${table("teams")} t ON t.id = m.team_id AND t.member_revision = m.member_revision WHERE m.company_id = ${companyId}`);
        const agentById = new Map(agents.map((agent) => [String(agent.id), agent]));
        const changes = new Map<string, string | null>();
        const requireAgent = (id: string, label: string) => {
          const agent = agentById.get(id);
          if (!agent) throw new Error(`${label} must be an existing agent in this company`);
          if (inactive(agent)) throw new Error(`${label} is unavailable`);
          return agent;
        };
        const reporting = (childId: string, parentId: string | null) => {
          requireAgent(childId, "The reporting agent");
          if (childId === parentId) throw new Error("An agent cannot report to itself");
          if (parentId) requireAgent(parentId, "The reporting manager");
          changes.set(childId, parentId);
        };
        const validateChanges = () => {
          for (const [id, parentId] of changes) {
            const child = agentById.get(id)!;
            const parent = parentId ? agentById.get(parentId)! : null;
            assertTemplateManager({ companyId, metadata: child.metadata, reportsTo: parentId }, parent ? {
              companyId, metadata: parent.metadata, status: String(parent.status), role: String(parent.role),
              reportsTo: changes.has(parentId!) ? changes.get(parentId!)! : text(parent.reports_to) || null,
            } : null);
            const seen = new Set<string>();
            let cursor: string | null = id;
            while (cursor) {
              if (seen.has(cursor)) throw new Error("The selected organization would create a reporting cycle");
              seen.add(cursor);
              const agent = agentById.get(cursor);
              if (!agent) throw new Error("Reporting manager must belong to this company");
              cursor = changes.has(cursor) ? changes.get(cursor)! : text(agent.reports_to) || null;
            }
          }
        };
        const detachFormerHead = (leadId: string, oldHead: string, proposedTeams: Row[], proposedDepartments: Row[], proposedMemberships: Row[]) => {
          if (!oldHead || leadId === oldHead || changes.has(leadId) || text(agentById.get(leadId)?.reports_to) !== oldHead) return;
          const stillReportsToHead = proposedMemberships.some((membership) => {
            if (membership.role !== "team_lead" || membership.agent_id !== leadId) return false;
            const ownedTeam = proposedTeams.find((item) => item.id === membership.team_id);
            return proposedDepartments.some((item) => item.id === ownedTeam?.department_id && item.head_agent_id === oldHead);
          });
          if (!stillReportsToHead) reporting(leadId, null);
        };
        const assertCoherentTeamHeads = (proposedTeams: Row[], proposedDepartments: Row[], proposedMemberships: Row[]) => {
          for (const [leadId, parentId] of changes) {
            const heads = new Set<string>();
            for (const membership of proposedMemberships) {
              if (membership.role !== "team_lead" || membership.agent_id !== leadId) continue;
              const ownedTeam = proposedTeams.find((item) => item.id === membership.team_id);
              const ownedDepartment = proposedDepartments.find((item) => item.id === ownedTeam?.department_id);
              const head = text(ownedDepartment?.head_agent_id);
              if (head && head !== leadId) heads.add(head);
            }
            if (heads.size > 1 || heads.size === 1 && !heads.has(parentId ?? "")) throw new Error("This team lead belongs to departments with different reporting heads");
          }
        };
        const applyChanges = async () => {
          validateChanges();
          for (const [id, parent] of changes) await tx.execute(sql`UPDATE public.agents SET reports_to = ${parent}::uuid, updated_at = now() WHERE id = ${id} AND company_id = ${companyId}`);
        };
        if (action === "save-department") {
          const requestedId = text(params.departmentId), headAgentId = text(params.headAgentId), teamIds = ids(params.teamIds);
          if (requestedId && !departments.some((department) => department.id === requestedId)) throw new Error("Department not found in this company");
          const departmentId = requestedId || randomUUID();
          if (headAgentId) requireAgent(headAgentId, "The department head");
          if (departments.some((department) => department.name === name && department.id !== departmentId)) throw new Error("A department with this name already exists in this company");
          for (const teamId of teamIds) {
            const team = teams.find((item) => item.id === teamId);
            if (!team) throw new Error("Every team must exist in this company");
            if (team.department_id && team.department_id !== departmentId) throw new Error("Remove the selected team from its current department before assigning it here");
            if (headAgentId) {
              const lead = memberships.find((member) => member.team_id === teamId && member.role === "team_lead");
              // One person may serve as both department head and team lead.
              if (lead && lead.agent_id !== headAgentId) reporting(String(lead.agent_id), headAgentId);
            }
          }
          const proposedTeams = teams.map((team) => ({ ...team, department_id: teamIds.includes(String(team.id)) ? departmentId : team.department_id === departmentId ? null : team.department_id }));
          const proposedDepartments = [...departments.filter((department) => department.id !== departmentId), { id: departmentId, head_agent_id: headAgentId || null }];
          const oldHead = text(departments.find((department) => department.id === departmentId)?.head_agent_id);
          for (const team of teams.filter((item) => item.department_id === departmentId)) {
            const previousLead = memberships.find((member) => member.team_id === team.id && member.role === "team_lead");
            if (previousLead) detachFormerHead(String(previousLead.agent_id), oldHead, proposedTeams, proposedDepartments, memberships);
          }
          assertCoherentTeamHeads(proposedTeams, proposedDepartments, memberships);
          await applyChanges();
          await tx.execute(sql`INSERT INTO ${table("departments")} (id, company_id, name, head_agent_id) VALUES (${departmentId}, ${companyId}, ${name}, ${headAgentId || null}::uuid) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, head_agent_id = EXCLUDED.head_agent_id, updated_at = now()`);
          const teamList = JSON.stringify(teamIds);
          await tx.execute(sql`UPDATE ${table("teams")} SET department_id = CASE WHEN id = ANY(ARRAY(SELECT jsonb_array_elements_text(${teamList}::jsonb))::uuid[]) THEN ${departmentId}::uuid ELSE NULL END WHERE company_id = ${companyId} AND (department_id = ${departmentId}::uuid OR id = ANY(ARRAY(SELECT jsonb_array_elements_text(${teamList}::jsonb))::uuid[]))`);
          return { departmentId, headAgentId: headAgentId || null, teamIds };
        }
        const projectId = text(params.projectId), requestedId = text(params.teamId), memberIds = ids(params.memberAgentIds);
        if (!uuid(projectId) || !(await rows(tx, sql`SELECT id FROM public.projects WHERE id = ${projectId} AND company_id = ${companyId}`)).length) throw new Error("Project not found in this company");
        let team = requestedId ? teams.find((item) => item.id === requestedId && item.project_id === projectId) : teams.find((item) => item.project_id === projectId && item.name === name);
        if (requestedId && !team) throw new Error("Team not found in this company and project");
        const teamId = text(team?.id) || randomUUID();
        if (teams.some((item) => item.project_id === projectId && item.name === name && item.id !== teamId)) throw new Error("A team with this name already exists in the selected project");
        const members = memberIds.map((id) => requireAgent(id, "Every member"));
        let leadAgentId = text(params.leadAgentId);
        if (leadAgentId && !memberIds.includes(leadAgentId)) throw new Error("The team lead must be a selected member");
        const previousLead = text(memberships.find((member) => member.team_id === teamId && member.role === "team_lead")?.agent_id);
        leadAgentId ||= (memberIds.includes(previousLead) ? previousLead : "") || text(members.find((member) => role(member)?.role === "leader")?.id) || memberIds[0] || "";
        if (leadAgentId && role(requireAgent(leadAgentId, "The team lead"))?.role === "member") throw new Error("A template member cannot serve as the team lead; select its existing leader");
        const departmentId = Object.hasOwn(params, "departmentId") ? text(params.departmentId) : text(team?.department_id);
        const department = departmentId ? departments.find((item) => item.id === departmentId) : null;
        if (departmentId && !department) throw new Error("Department not found in this company");
        const headAgentId = text(department?.head_agent_id);
        for (const id of memberIds) {
          if (id === leadAgentId) continue;
          const otherTeam = memberships.find((member) => member.agent_id === id && member.team_id !== teamId && member.role !== "team_lead" && memberships.some((lead) => lead.team_id === member.team_id && lead.role === "team_lead" && lead.agent_id !== leadAgentId));
          if (otherTeam) throw new Error("This member already belongs to a team with a different reporting leader");
          const child = agentById.get(id)!, parent = agentById.get(leadAgentId)!;
          const childProject = text((child.metadata as Row | null)?.awProject), parentProject = text((parent.metadata as Row | null)?.awProject);
          if (childProject && parentProject && childProject !== parentProject) throw new Error("Team members and their lead must belong to the same agent project scope");
          reporting(id, leadAgentId);
        }
        if (leadAgentId && headAgentId && leadAgentId !== headAgentId) reporting(leadAgentId, headAgentId);
        // Promoting a previous member to lead also removes its former edge to
        // the selected membership, otherwise changing leaders forms a cycle.
        else if (leadAgentId && memberIds.includes(text(agentById.get(leadAgentId)?.reports_to))) reporting(leadAgentId, null);
        const proposedTeams = [...teams.filter((item) => item.id !== teamId), { id: teamId, department_id: departmentId || null }];
        const proposedMemberships = [...memberships.filter((member) => member.team_id !== teamId), ...memberIds.map((id) => ({ team_id: teamId, agent_id: id, role: id === leadAgentId ? "team_lead" : "team_member" }))];
        const oldHead = text(departments.find((item) => item.id === team?.department_id)?.head_agent_id);
        if (leadAgentId) detachFormerHead(leadAgentId, oldHead, proposedTeams, departments, proposedMemberships);
        assertCoherentTeamHeads(proposedTeams, departments, proposedMemberships);
        await applyChanges();
        const revision = randomUUID();
        await tx.execute(sql`INSERT INTO ${table("teams")} (id, company_id, project_id, name, department_id, member_revision) VALUES (${teamId}, ${companyId}, ${projectId}, ${name}, ${departmentId || null}::uuid, ${revision}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, department_id = EXCLUDED.department_id, member_revision = EXCLUDED.member_revision, updated_at = now()`);
        await tx.execute(sql`DELETE FROM ${table("team_members")} WHERE team_id = ${teamId} AND company_id = ${companyId}`);
        for (const id of memberIds) await tx.execute(sql`INSERT INTO ${table("team_members")} (team_id, company_id, project_id, member_revision, agent_id, role) VALUES (${teamId}, ${companyId}, ${projectId}, ${revision}, ${id}, ${id === leadAgentId ? "team_lead" : "team_member"})`);
        return { teamId, leadAgentId: leadAgentId || null, departmentId: departmentId || null };
      });
    },
  };
}
