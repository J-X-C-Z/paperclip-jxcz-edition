import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { useOptionalCompany } from "../context/CompanyContext";
import { useOptionalProjectScope } from "../context/ProjectScopeContext";
import { useProjectWorkspaceEnabled } from "./useProjectWorkspaceEnabled";
import { queryKeys } from "../lib/queryKeys";

const EMPTY_AGENTS: Agent[] = [];
const EMPTY_MEMBERSHIPS: Array<{ agentId: string }> = [];

export function useScopedAgents(selectedProjectId?: string | null, selectedCompanyIdOverride?: string | null) {
  const companyContext = useOptionalCompany();
  const selectedCompanyId = companyContext?.selectedCompanyId ?? null;
  const scope = useOptionalProjectScope();
  const feature = useProjectWorkspaceEnabled();
  const explicitProject = selectedProjectId !== undefined;
  const scopeLoading = feature.loaded === false || (!explicitProject && scope?.loading === true);
  const scopeError = feature.error ?? (!explicitProject && scope?.enabled ? scope.error : null);
  const scopeReady = !scopeLoading && !scopeError;
  const activeCompanyId = selectedCompanyIdOverride === undefined ? selectedCompanyId : selectedCompanyIdOverride;
  const companyId = activeCompanyId ?? "__none__";
  // Pickers must follow their own selected project (which can differ from the
  // board's global project scope). Callers that omit the override retain the
  // existing page/sidebar scope behavior.
  const scopedProjectId = selectedProjectId !== undefined
    ? selectedProjectId
    : scope?.enabled === true
      ? scope.projectId
      : null;
  const projectScoped = feature.enabled && Boolean(scopedProjectId);
  const projectId = projectScoped ? scopedProjectId! : null;
  const allAgentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!activeCompanyId && scopeReady,
  });
  const membershipsQuery = useQuery({
    queryKey: queryKeys.projects.agentMemberships(companyId, projectId ?? "__none__"),
    queryFn: () => projectsApi.listAgentMemberships(projectId!, companyId),
    enabled: !!activeCompanyId && scopeReady && projectScoped,
  });
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.agentMemberships(companyId, projectId) });
  };
  const saveMembership = useMutation({
    mutationFn: (input: { agentId: string; projectRole?: string | null; isLead?: boolean; sortOrder?: number | null }) =>
      projectsApi.upsertAgentMembership(projectId!, input, companyId),
    onSuccess: invalidate,
  });
  const removeMembership = useMutation({
    mutationFn: (agentId: string) => projectsApi.removeAgentMembership(projectId!, agentId, companyId),
    onSuccess: invalidate,
  });
  const allAgents = scopeReady ? allAgentsQuery.data ?? EMPTY_AGENTS : EMPTY_AGENTS;
  const memberships = membershipsQuery.data ?? EMPTY_MEMBERSHIPS;
  const memberIds = useMemo(
    () => new Set(memberships.map((membership) => membership.agentId)),
    [memberships],
  );
  const agents = useMemo(
    () => projectScoped ? allAgents.filter((agent) => memberIds.has(agent.id)) : allAgents,
    [allAgents, memberIds, projectScoped],
  );
  return {
    agents,
    allAgents,
    memberIds,
    memberships: membershipsQuery.data ?? [],
    projectScoped,
    projectId,
    scopeReady,
    scopeLoading,
    scopeError,
    isMember: (agentId: string | null | undefined) => Boolean(agentId && memberIds.has(agentId)),
    companyId: activeCompanyId,
    isLoading: !scopeError && (scopeLoading || allAgentsQuery.isLoading || (projectScoped && membershipsQuery.isLoading)),
    error: (scopeError ?? allAgentsQuery.error ?? membershipsQuery.error) as Error | null,
    saveMembership,
    removeMembership,
    query: allAgentsQuery,
    membershipsQuery,
  };
}

/** Build a project-only view while preserving each member's real company parent when present. */
export interface ScopedOrgNode {
  id: string;
  name: string;
  role: string;
  status: string;
  reports: ScopedOrgNode[];
}

export function buildScopedOrgTree(agents: Agent[]): ScopedOrgNode[] {
  const members = new Map(agents.map((agent) => [agent.id, agent]));
  const children = new Map<string, Agent[]>();
  const roots: Agent[] = [];
  for (const agent of agents) {
    const parent = agent.reportsTo ? members.get(agent.reportsTo) : undefined;
    if (parent && parent.id !== agent.id) {
      const list = children.get(parent.id) ?? [];
      list.push(agent);
      children.set(parent.id, list);
    } else {
      roots.push(agent);
    }
  }
  const seen = new Set<string>();
  const visit = (agent: Agent): ScopedOrgNode => {
    seen.add(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.title || agent.role,
      status: agent.status,
      reports: (children.get(agent.id) ?? [])
        .filter((child) => !seen.has(child.id))
        .map(visit),
    };
  };
  const tree = roots.sort((a, b) => a.name.localeCompare(b.name)).map(visit);
  // Cycles are invalid company data. Surface each unvisited member as a root
  // without inventing a reporting edge or dropping it from the project view.
  for (const agent of agents) if (!seen.has(agent.id)) tree.push(visit(agent));
  return tree;
}

export function filterScopedAgents(
  agents: Agent[],
  memberships: Array<{ agentId: string }>,
  projectScoped: boolean,
) {
  if (!projectScoped) return agents;
  const memberIds = new Set(memberships.map((membership) => membership.agentId));
  return agents.filter((agent) => memberIds.has(agent.id));
}

/** Project picker choices plus the assigned legacy agent as a Keep choice. */
export function projectAssigneeChoices<T extends { id: string }>(
  agents: T[],
  memberships: Array<{ agentId: string }>,
  projectScoped: boolean,
  currentAssigneeId?: string | null,
) {
  if (!projectScoped) return agents;
  const memberIds = new Set(memberships.map((membership) => membership.agentId));
  return agents.filter((agent) => memberIds.has(agent.id) || agent.id === currentAssigneeId);
}

export function legacyAssigneeState(assigneeAgentId: string | null | undefined, memberIds: Set<string>) {
  if (!assigneeAgentId) return "unassigned" as const;
  return memberIds.has(assigneeAgentId) ? "member" as const : "legacy" as const;
}
