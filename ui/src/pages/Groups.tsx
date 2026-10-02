import { uiText } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, FolderOpen, Crown, WandSparkles } from "lucide-react";
import { Link, useSearchParams } from "@/lib/router";
import { improvementTeamsApi, existingGroupMembers, type GroupAgent, type ImprovementGroup, type GroupMembershipSync, type Department, type OrganizationTask } from "@/api/improvementTeams";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OrganizationTasks } from "@/components/OrganizationTasks";
import { queryKeys } from "@/lib/queryKeys";

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const groupKey = (companyId: string) => ["organization-groups", companyId] as const;
function roleLabel(agent: GroupAgent) {
  const role = String(agent.metadata?.awRoleId ?? "");
  return role.endsWith("-coder") ? uiText("Developer") : role.endsWith("-researcher") ? uiText("Researcher") : agent.title || uiText("Member");
}

export function Groups() {
  const { selectedCompanyId } = useCompany();
  const [params] = useSearchParams();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: uiText("Organization structure") }, { label: uiText("Groups") }]); }, [setBreadcrumbs]);
  return selectedCompanyId ? <GroupWorkspace key={selectedCompanyId} companyId={selectedCompanyId} initialDepartmentId={params.get("department") ?? ""} /> : <p className="p-6 text-muted-foreground">{uiText("Please select an organization first.")}</p>;
}

export function GroupWorkspace({ companyId, initialDepartmentId = "" }: { companyId: string; initialDepartmentId?: string }) {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: groupKey(companyId), queryFn: () => improvementTeamsApi.list(companyId) });
  const [editor, setEditor] = useState<{ team?: ImprovementGroup } | null>(null);
  const [sync, setSync] = useState<GroupMembershipSync | null>(null);
  const [notice, setNotice] = useState("");
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  useEffect(() => { setDepartmentId(initialDepartmentId); }, [initialDepartmentId]);
  const operationRef = useRef(false);
  const [operating, setOperating] = useState(false);
  async function runOperation(action: () => Promise<void>) {
    if (operationRef.current) throw new Error(uiText("Saving another group. Please wait."));
    operationRef.current = true; setOperating(true);
    try { await action(); } finally { operationRef.current = false; setOperating(false); }
  }
  async function refresh(input: GroupMembershipSync) {
    await Promise.all([
      cache.invalidateQueries({ queryKey: groupKey(companyId) }),
      cache.invalidateQueries({ queryKey: queryKeys.projects.agentMemberships(companyId, input.projectId) }),
      cache.invalidateQueries({ queryKey: ["project-teams"] }),
      cache.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) }),
      cache.invalidateQueries({ queryKey: queryKeys.org(companyId) }),
    ]);
  }
  const syncMutation = useMutation({
    mutationFn: async (input: GroupMembershipSync) => { await improvementTeamsApi.syncMembers(input); return input; },
    onSuccess: async input => { setSync(null); setNotice(uiText("Group and project members saved")); await refresh(input); },
  });
  async function saved(input: GroupMembershipSync) {
    setSync(input); setNotice(""); setEditor(null);
    await refresh(input);
    syncMutation.mutate(input);
  }
  if (query.isPending) return <p className="p-6 text-muted-foreground">{uiText("Loading groups…")}</p>;
  if (query.error) return <div className="space-y-3 p-6"><p role="alert">{uiText("Failed to load groups: {error}", { error: query.error.message })}</p><Button variant="outline" onClick={() => query.refetch()}>{uiText("Retry")}</Button></div>;
  const data = query.data;
  if (!data) return null;
  const locked = sync !== null || operating;
  const departments = data.departments ?? [];
  const filter = departmentId === "unassigned" || departments.some(entry => entry.id === departmentId) ? departmentId : "";
  const teams = data.teams.filter(team => !filter || (filter === "unassigned" ? !team.departmentId : team.departmentId === filter));
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1"><h1 className="text-2xl font-semibold">{uiText("Groups")}</h1><p className="text-sm text-muted-foreground">{uiText("Group lead and members")}</p></div>
      <Button disabled={locked} onClick={() => { setNotice(""); setEditor({}); }}><Plus className="size-4" />{uiText("Configure groups")}</Button>
    </header>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    {sync ? <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4" role={syncMutation.error ? "alert" : "status"}>
      <p className="text-sm">{syncMutation.error ? uiText("Group saved, but project member sync failed: {error}", { error: syncMutation.error.message }) : uiText("Group saved, syncing project members…")}</p>
      {syncMutation.error ? <Button size="sm" variant="outline" onClick={() => syncMutation.mutate(sync)}>{uiText("Retry project member sync")}</Button> : null}
    </div> : null}
    <p className="text-xs text-muted-foreground">{uiText("Current organization · {count} groups · view and configure across projects", { count: data.teams.length })}</p>
    {departments.length ? <label className="flex max-w-sm items-center gap-3 text-sm"><span className="shrink-0">{uiText("Department filter")}</span><select value={filter} onChange={event => setDepartmentId(event.target.value)} className={fieldClass}><option value="">{uiText("All departments")}</option><option value="unassigned">{uiText("Unassigned department")}</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label> : null}
    {teams.length ? <div className="grid gap-5 lg:grid-cols-2">{teams.map(team => <GroupCard key={team.id} team={team} departmentName={departments.find(department => department.id === team.departmentId)?.name} tasks={data.tasks ?? []} agents={data.agents} projects={data.projects} companyId={companyId} pluginId={data.pluginId} locked={locked} runOperation={runOperation} onEdit={() => setEditor({ team })} onSaved={saved} />)}</div> : data.teams.length ? <p className="rounded-md border border-dashed border-border p-8 text-sm text-muted-foreground">{uiText("No groups are assigned to this department yet.")}</p> :
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"><Users className="size-8 text-muted-foreground" /><h2 className="font-medium">{uiText("No groups yet")}</h2><p className="text-sm text-muted-foreground">{uiText("Choose existing leads, automatically include their direct reports, and assign projects.")}</p><Button disabled={locked} onClick={() => setEditor({})}>{uiText("Create the first group")}</Button></div>}
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !operationRef.current) setEditor(null); }}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editor?.team ? uiText("Configure group") : uiText("Configure groups")}</DialogTitle><DialogDescription>{uiText("Assign an existing group lead, automatically include their direct reports, and assign projects.")}</DialogDescription></DialogHeader>
        {editor ? <GroupEditor key={editor.team?.id ?? "new"} team={editor.team} agents={data.agents} projects={data.projects} departments={departments} companyId={companyId} pluginId={data.pluginId} runOperation={runOperation} onSaved={saved} /> : null}
      </DialogContent>
    </Dialog>
  </main>;
}

function GroupCard({ team, departmentName, tasks, agents, projects, companyId, pluginId, locked, runOperation, onEdit, onSaved }: {
  team: ImprovementGroup; agents: GroupAgent[]; projects: Array<{ id: string; name: string; status: string }>;
  companyId: string; pluginId: string; locked: boolean; onEdit: () => void; onSaved: (input: GroupMembershipSync) => Promise<void>;
  runOperation: (action: () => Promise<void>) => Promise<void>;
  departmentName?: string; tasks: OrganizationTask[];
}) {
  const [projectId, setProjectId] = useState(team.projectId);
  useEffect(() => { setProjectId(team.projectId); }, [team.projectId]);
  const lead = team.members.find(member => member.role === "team_lead");
  const leadAgent = agents.find(agent => agent.id === lead?.agentId);
  const assignment = useMutation({ mutationFn: () => runOperation(async () => {
    const result = await improvementTeamsApi.assign(pluginId, companyId, team.id, projectId);
    await onSaved({ ...result, companyId });
  }) });
  const busy = Boolean(team.active_cycle_id);
  return <section aria-label={team.name} className="space-y-5 rounded-lg border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{team.name}</h2><p className="mt-1 text-xs text-muted-foreground">{uiText("{count} members{busy}", { count: team.members.length, busy: busy ? ` · ${uiText("improvement cycle in progress")}` : "" })}</p><Link to="/departments" className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-4">{departmentName ?? uiText("Unassigned department")}</Link></div><Button size="sm" variant="outline" disabled={locked || assignment.isPending} onClick={onEdit}>{uiText("Configure group members")}</Button></div>
    <div className="space-y-4 rounded-md border border-dashed border-border p-4">
      <div className="flex items-center gap-3"><Crown className="size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{uiText("Team lead")}</p><p className="text-sm font-medium">{leadAgent?.name ?? uiText("No team lead available")}</p></div></div>
      <div className="border-t border-border pt-3"><p className="mb-2 text-xs text-muted-foreground">{uiText("Team members")}</p><div className="flex flex-wrap gap-2">{team.members.filter(member => member.role !== "team_lead").map(member => {
        const agent = agents.find(entry => entry.id === member.agentId);
        return <span key={member.agentId} className="rounded-md bg-muted px-3 py-2 text-sm">{agent?.name ?? uiText("Member unavailable")}<span className="ml-2 text-xs text-muted-foreground">{agent ? roleLabel(agent) : ""}</span></span>;
      })}{team.members.length <= 1 ? <p className="text-sm text-muted-foreground">{uiText("No group members configured yet")}</p> : null}</div></div>
    </div>
    <OrganizationTasks tasks={tasks} agents={agents} agentIds={team.members.map(member => member.agentId)} />
    <div className="space-y-3"><Link to={`/projects/${team.projectId}`} className="flex items-center gap-2 text-sm font-medium"><FolderOpen className="size-4" />{team.projectName}</Link>
      <div className="flex gap-2"><select aria-label={uiText("{team} responsible project", { team: team.name })} value={projectId} onChange={event => setProjectId(event.target.value)} disabled={locked || busy || assignment.isPending} className={fieldClass}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Button variant="outline" disabled={locked || busy || assignment.isPending || projectId === team.projectId} onClick={() => assignment.mutate()}>{assignment.isPending ? uiText("Assigning…") : uiText("Assign project")}</Button></div>
      {busy ? <p className="text-xs text-muted-foreground">{uiText("The project can be changed after the current cycle ends.")}</p> : null}
      {assignment.error ? <p role="alert" className="text-sm text-destructive">{uiText("Project assignment failed: {error}", { error: assignment.error.message })}</p> : null}
    </div>
  </section>;
}

function GroupEditor({ team, agents, projects, departments, companyId, pluginId, runOperation, onSaved }: {
  team?: ImprovementGroup; agents: GroupAgent[]; projects: Array<{ id: string; name: string; status: string }>; departments: Department[];
  companyId: string; pluginId: string; onSaved: (input: GroupMembershipSync) => Promise<void>;
  runOperation: (action: () => Promise<void>) => Promise<void>;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [leadId, setLeadId] = useState(team?.members.find(member => member.role === "team_lead")?.agentId ?? "");
  const [members, setMembers] = useState(team?.members.map(member => member.agentId) ?? []);
  const [projectId, setProjectId] = useState(team?.projectId ?? "");
  const [departmentId, setDepartmentId] = useState(team?.departmentId ?? "");
  const available = agents.filter(agent => agent.status !== "terminated");
  const isLeader = (agent: GroupAgent) => agent.templateRole === "leader" || /组长/.test(agent.name) || available.some(member => member.reportsTo === agent.id);
  const leaders = available.filter(agent => agent.templateRole !== "member");
  function selectLead(id: string) {
    setLeadId(id); setMembers(existingGroupMembers(agents, id));
    if (!team) setName((agents.find(agent => agent.id === id)?.name ?? "").replace(/组长$/, "小组"));
  }
  const mutation = useMutation({ mutationFn: () => runOperation(async () => {
    const input = { companyId, projectId, leadAgentId: leadId, memberAgentIds: members, name: name.trim(), departmentId: departmentId || null, ...(team ? { teamId: team.id } : {}) };
    const result = await improvementTeamsApi.save(pluginId, input);
    await onSaved({ ...input, leadAgentId: result.leadAgentId, previousLeadAgentId: team?.members.find(member => member.role === "team_lead")?.agentId });
  }) });
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
    <fieldset disabled={mutation.isPending} className="space-y-4">
      <label className="block space-y-2"><span className="text-sm font-medium">{uiText("Team lead")}</span><select required value={leadId} onChange={event => selectLead(event.target.value)} className={fieldClass}><option value="">{uiText("Choose an existing team lead")}</option>{[true, false].map(known => <optgroup key={String(known)} label={known ? uiText("Existing team leads") : uiText("Other agents")}>{leaders.filter(agent => isLeader(agent) === known).map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {roleLabel(agent)}</option>)}</optgroup>)}</select></label>
      <label className="block space-y-2"><span className="text-sm font-medium">{uiText("Group name")}</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} className={fieldClass} /></label>
      <label className="block space-y-2"><span className="text-sm font-medium">{uiText("Project")}</span><select required disabled={Boolean(team)} value={projectId} onChange={event => setProjectId(event.target.value)} className={fieldClass}><option value="">{uiText("Choose a project")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="block space-y-2"><span className="text-sm font-medium">{uiText("Department filter")}</span><select aria-label={uiText("Group department")} value={departmentId} onChange={event => setDepartmentId(event.target.value)} className={fieldClass}><option value="">{uiText("Do not assign a department yet")}</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <p className="text-xs text-muted-foreground">{uiText("After saving, members report to the lead by default; if a department head is configured, the lead reports to that head.")}</p>
      <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{uiText("Group members · {count}", { count: members.length })}</h3><Button type="button" size="sm" variant="ghost" disabled={!leadId} onClick={() => setMembers(existingGroupMembers(agents, leadId))}><WandSparkles className="size-4" />{uiText("Include direct reports")}</Button></div>
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border p-2">{[...available].sort((a, b) => Number(b.id === leadId) - Number(a.id === leadId) || Number(members.includes(b.id)) - Number(members.includes(a.id))).map(agent => <label key={agent.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"><input type="checkbox" checked={members.includes(agent.id)} disabled={agent.id === leadId || !leadId} onChange={event => setMembers(previous => event.target.checked ? [...previous, agent.id] : previous.filter(id => id !== agent.id))} /><span className="flex-1 text-sm">{agent.name}</span><span className="text-xs text-muted-foreground">{agent.id === leadId ? uiText("Team lead") : roleLabel(agent)}</span></label>)}</div>
      </div>
    </fieldset>
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{uiText("Group save failed: {error}", { error: mutation.error.message })}</p> : null}
    <Button type="submit" className="w-full" disabled={!leadId || !projectId || !name.trim() || mutation.isPending}>{mutation.isPending ? uiText("Saving…") : team ? uiText("Save group settings") : uiText("Create group and assign project")}</Button>
  </form>;
}
