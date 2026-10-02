import { uiText } from "@/i18n";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { AgentIcon } from "./AgentIconPicker";
import { Button } from "@/components/ui/button";
import type { ProjectAgentMembership } from "@paperclipai/shared";

export function ProjectTeam({ companyId, projectId }: { companyId: string; projectId: string }) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const queryClient = useQueryClient();
  const mutationLock = useRef(false);
  const membershipsKey = queryKeys.projects.agentMemberships(companyId, projectId);
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  const membershipsQuery = useQuery({
    queryKey: membershipsKey,
    queryFn: () => projectsApi.listAgentMemberships(projectId, companyId),
  });
  const finishMutation = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: membershipsKey });
    } finally {
      mutationLock.current = false;
    }
  };
  const mutateExclusively = (mutation: () => void) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    mutation();
  };
  const upsert = useMutation({
    mutationFn: (membership: { agentId: string; projectRole?: string | null; isLead?: boolean; sortOrder?: number | null }) =>
      projectsApi.upsertAgentMembership(projectId, membership, companyId),
    onSettled: finishMutation,
  });
  const remove = useMutation({
    mutationFn: (agentId: string) => projectsApi.removeAgentMembership(projectId, agentId, companyId),
    onSettled: finishMutation,
  });
  const reorder = useMutation({
    mutationFn: async (orderedMembers: ProjectAgentMembership[]) => {
      // Normalize duplicate or unset ranks as well as the two moved rows.
      // Partial failures refetch the actual server order before allowing another edit.
      for (const [sortOrder, member] of orderedMembers.entries()) {
        if (member.sortOrder === sortOrder) continue;
        await projectsApi.upsertAgentMembership(projectId, { agentId: member.agentId, sortOrder }, companyId);
      }
    },
    onSettled: finishMutation,
  });
  const saving = upsert.isPending || remove.isPending || reorder.isPending;
  const agentsById = useMemo(() => new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent])), [agentsQuery.data]);
  const members: ProjectAgentMembership[] = membershipsQuery.data ?? [];
  const memberIds = new Set(members.map((member) => member.agentId));
  const available = (agentsQuery.data ?? []).filter((agent) => !memberIds.has(agent.id));

  const moveMember = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= members.length) return;
    const ordered = [...members];
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    mutateExclusively(() => reorder.mutate(ordered));
  };

  if (agentsQuery.isLoading || membershipsQuery.isLoading) return <p className="text-sm text-muted-foreground">{uiText("Loading team…")}</p>;
  if (agentsQuery.error || membershipsQuery.error) {
    return <p className="text-sm text-destructive">{(agentsQuery.error ?? membershipsQuery.error as Error).message}</p>;
  }

  return (
    <section className="space-y-4" aria-label={uiText("Project team")}>
      {(upsert.error || remove.error || reorder.error) && (
        <p role="alert" className="text-sm text-destructive">{(upsert.error ?? remove.error ?? reorder.error as Error).message}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={uiText("Add project agent")}
          disabled={saving}
          value={selectedAgentId}
          onChange={(event) => setSelectedAgentId(event.target.value)}
          className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{uiText("Choose a company agent…")}</option>
          {available.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <Button
          size="sm"
          disabled={!selectedAgentId || saving}
          onClick={() => {
            mutateExclusively(() => upsert.mutate({ agentId: selectedAgentId }));
            setSelectedAgentId("");
          }}
        >{uiText("Add member")}</Button>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{uiText("No project team members yet.")}</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {members.map((member, index) => {
            const agent = agentsById.get(member.agentId);
            if (!agent) return null;
            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={`${uiText("Move up")}: ${agent.name}`} title={uiText("Move up")} disabled={saving || index === 0} onClick={() => moveMember(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`${uiText("Move down")}: ${agent.name}`} title={uiText("Move down")} disabled={saving || index === members.length - 1} onClick={() => moveMember(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <AgentIcon icon={agent.icon} className="h-6 w-6 shrink-0" />
                <span className="min-w-32 flex-1 text-sm font-medium">{agent.name}</span>
                <input
                  aria-label={`${uiText("Project role")}: ${agent.name}`}
                  disabled={saving}
                  className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm"
                  placeholder={uiText("Project role")}
                  defaultValue={member.projectRole ?? ""}
                  onBlur={(event) => {
                    const projectRole = event.currentTarget.value.trim() || null;
                    if (projectRole !== member.projectRole) mutateExclusively(() => upsert.mutate({ agentId: member.agentId, projectRole }));
                  }}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={member.isLead}
                    disabled={saving}
                    onChange={(event) => mutateExclusively(() => upsert.mutate({ agentId: member.agentId, isLead: event.target.checked }))}
                  />
                  {uiText("Lead")}
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => mutateExclusively(() => remove.mutate(member.agentId))}
                >{uiText("Remove")}</Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
