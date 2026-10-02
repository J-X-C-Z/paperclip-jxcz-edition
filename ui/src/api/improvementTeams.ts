import { pluginsApi } from "./plugins";
import { projectsApi } from "./projects";

export interface GroupAgent {
  id: string; name: string; title: string | null; status: string;
  reportsTo: string | null; templateRole?: string | null;
  metadata?: Record<string, unknown> | null;
}
export interface ImprovementGroup {
  id: string; name: string; projectId: string; projectName: string;
  members: Array<{ agentId: string; role: string }>;
  active_cycle_id?: string | null;
  departmentId?: string | null;
}
export interface Department { id: string; name: string; headAgentId: string | null }
export interface OrganizationTask {
  id: string; identifier: string | null; title: string; status: string;
  assigneeAgentId: string | null; projectId: string | null; projectName: string | null;
}
export interface CompanyGroups {
  teams: ImprovementGroup[]; agents: GroupAgent[];
  projects: Array<{ id: string; name: string; status: string; organizationTeamIds?: string[]; organizationDepartmentIds?: string[] }>;
  departments?: Department[];
  tasks?: OrganizationTask[];
}
export const organizationGroupsKey = (companyId: string) => ["organization-groups", companyId] as const;
export const IMPROVEMENT_TEAMS_PLUGIN_KEY = "paperclip-improvement-teams";
export interface GroupMembershipSync {
  companyId: string; projectId: string; leadAgentId: string; memberAgentIds: string[];
  previousLeadAgentId?: string;
}

export function existingGroupMembers(agents: GroupAgent[], leadId: string): string[] {
  return agents.filter(agent => agent.id === leadId || (agent.reportsTo === leadId && agent.status !== "terminated"))
    .map(agent => agent.id);
}

export const improvementTeamsApi = {
  async pluginId() {
    const plugins = await pluginsApi.list();
    const plugin = plugins.find(entry => entry.pluginKey === "paperclip-improvement-teams" && entry.status === "ready");
    if (!plugin) throw new Error("小组管理插件尚未就绪，请在设置中启用改进小组插件。");
    return plugin.id;
  },
  async list(companyId: string): Promise<CompanyGroups & { pluginId: string }> {
    // The bridge resolves manifest keys as well as UUIDs and checks ready state.
    // Avoid a separate plugin-discovery request before every organization read.
    const pluginId = IMPROVEMENT_TEAMS_PLUGIN_KEY;
    const response = await pluginsApi.bridgeGetData(pluginId, "company-teams", { companyId }, companyId);
    return { ...(response.data as CompanyGroups), pluginId };
  },
  async save(pluginId: string, input: GroupMembershipSync & { name: string; teamId?: string; departmentId?: string | null }) {
    const response = await pluginsApi.bridgePerformAction(pluginId, "save-team", { ...input }, input.companyId);
    return response.data as { teamId: string; leadAgentId: string };
  },
  async assign(pluginId: string, companyId: string, teamId: string, projectId: string) {
    const response = await pluginsApi.bridgePerformAction(pluginId, "assign-team-project", { companyId, teamId, projectId }, companyId);
    return response.data as Omit<GroupMembershipSync, "companyId"> & { teamId: string };
  },
  async saveDepartment(pluginId: string, input: { companyId: string; departmentId?: string; name: string; headAgentId: string | null; teamIds: string[] }) {
    const response = await pluginsApi.bridgePerformAction(pluginId, "save-department", input, input.companyId);
    return response.data as { departmentId: string; headAgentId: string | null; teamIds: string[] };
  },
  async saveProjectOrganization(pluginId: string, input: { companyId: string; projectId: string; teamIds: string[]; departmentIds: string[] }) {
    const response = await pluginsApi.bridgePerformAction(pluginId, "save-project-organization", input, input.companyId);
    return response.data as { teamIds: string[]; departmentIds: string[] };
  },
  async syncMembers(input: GroupMembershipSync) {
    const project = await projectsApi.get(input.projectId, input.companyId);
    if (project.companyId !== input.companyId) throw new Error("项目不属于当前公司");
    for (const agentId of new Set(input.memberAgentIds)) {
      const membership = await projectsApi.upsertAgentMembership(input.projectId, {
        agentId, ...(agentId === input.leadAgentId ? { isLead: true } : {}),
      }, input.companyId);
      if (membership.companyId !== input.companyId || membership.projectId !== input.projectId || membership.agentId !== agentId) {
        throw new Error("项目成员同步响应不一致");
      }
    }
    if (input.previousLeadAgentId && input.previousLeadAgentId !== input.leadAgentId) {
      const groups = await this.list(input.companyId);
      const stillLeads = groups.teams.some(team => team.projectId === input.projectId &&
        team.members.some(member => member.agentId === input.previousLeadAgentId && member.role === "team_lead"));
      if (!stillLeads) {
        // Only demote the known previous group leader; preserve all other leaders.
        const memberships = await projectsApi.listAgentMemberships(input.projectId, input.companyId);
        if (memberships.some(member => member.agentId === input.previousLeadAgentId && member.isLead)) {
          await projectsApi.upsertAgentMembership(input.projectId, { agentId: input.previousLeadAgentId, isLead: false }, input.companyId);
        }
      }
    }
  },
};
