import { uiText } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Crown, FolderOpen, Plus, Users, WandSparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { improvementTeamsApi, organizationGroupsKey, type CompanyGroups, type Department } from "@/api/improvementTeams";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { OrganizationTasks } from "@/components/OrganizationTasks";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function Departments() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: uiText("Organization structure") }, { label: uiText("Departments") }]); }, [setBreadcrumbs]);
  return selectedCompanyId ? <DepartmentWorkspace key={selectedCompanyId} companyId={selectedCompanyId} /> : <p className="p-6 text-muted-foreground">{uiText("Please select an organization first.")}</p>;
}

export function DepartmentWorkspace({ companyId }: { companyId: string }) {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: organizationGroupsKey(companyId), queryFn: () => improvementTeamsApi.list(companyId) });
  const [editor, setEditor] = useState<{ department?: Department } | null>(null);
  const saving = useRef(false);
  const [notice, setNotice] = useState("");
  if (query.isPending) return <p className="p-6 text-muted-foreground">{uiText("Loading departments…")}</p>;
  if (query.error && !query.data) return <div className="space-y-3 p-6"><p role="alert">{uiText("Failed to load departments: {error}", { error: query.error.message })}</p><Button variant="outline" onClick={() => query.refetch()}>{uiText("Retry")}</Button></div>;
  if (!query.data) return null;
  const data = query.data;
  const departments = data.departments ?? [];
  const unassigned = data.teams.filter(team => !team.departmentId);
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div className="space-y-1"><h1 className="text-2xl font-semibold">{uiText("Departments")}</h1><p className="text-sm text-muted-foreground">{uiText("A department manages multiple groups, and each group owns its project.")}</p></div><Button onClick={() => { setNotice(""); setEditor({}); }}><Plus className="size-4" />{uiText("Configure department")}</Button></header>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    {query.error ? <p role="status" className="text-sm text-muted-foreground">{uiText("Could not refresh; showing the previously loaded departments.")}<Button size="sm" variant="ghost" onClick={() => query.refetch()}>{uiText("Retry")}</Button></p> : null}
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{uiText("Current organization · {count} departments", { count: departments.length })}</span><Link to="/groups">{uiText("{count} groups are not assigned to a department", { count: unassigned.length })}</Link></div>
    {departments.length ? <div className="grid items-start gap-5 lg:grid-cols-2">{departments.map(department => {
      const teams = data.teams.filter(team => team.departmentId === department.id);
      const head = data.agents.find(agent => agent.id === department.headAgentId);
      const count = new Set(teams.flatMap(team => team.members.map(member => member.agentId))).size;
      return <section key={department.id} aria-label={department.name} className="space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Building2 className="size-4 text-muted-foreground" />{department.name}</h2><p className="mt-1 text-xs text-muted-foreground">{uiText("{groups} groups · {members} group members", { groups: teams.length, members: count })}</p></div><Button size="sm" variant="outline" onClick={() => { setNotice(""); setEditor({ department }); }}>{uiText("Manage department")}</Button></div>
        <div className="flex items-center gap-3 rounded-md bg-muted p-3"><Crown className="size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{uiText("Department head")}</p><p className="text-sm font-medium">{head?.name ?? uiText("Configure a department head")}</p></div>{!head ? <Link className="ml-auto text-xs underline underline-offset-4" to="/agents/new?templateId=department-head">{uiText("Create from department head template")}</Link> : null}</div>
        <div className="space-y-3 rounded-md border border-dashed border-border p-4"><h3 className="text-xs text-muted-foreground">{uiText("Department groups")}</h3>{teams.length ? teams.map(team => {
          const lead = data.agents.find(agent => agent.id === team.members.find(member => member.role === "team_lead")?.agentId);
          return <div key={team.id} className="space-y-2 rounded-md border border-border bg-background p-3"><div className="flex items-center justify-between gap-2"><Link to={`/groups?department=${department.id}`} className="text-sm font-medium">{team.name}</Link><span className="text-xs text-muted-foreground">{uiText("{count} members", { count: team.members.length })}</span></div><p className="text-xs text-muted-foreground">{uiText("Team lead")} · {lead?.name ?? uiText("Not configured")}</p><Link to={`/projects/${team.projectId}`} className="flex items-center gap-2 text-xs"><FolderOpen className="size-3" />{team.projectName || uiText("Responsible project")}</Link></div>;
        }) : <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Users className="size-4" />{uiText("No groups assigned. Select “Manage department” to add groups.")}</div>}</div>
        <OrganizationTasks tasks={data.tasks ?? []} agents={data.agents} agentIds={[...(department.headAgentId ? [department.headAgentId] : []), ...teams.flatMap(team => team.members.map(member => member.agentId))]} />
      </section>;
    })}</div> : <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"><Building2 className="size-8 text-muted-foreground" /><h2 className="font-medium">{uiText("No departments yet")}</h2><p className="text-sm text-muted-foreground">{uiText("Configure the department head and choose its groups to establish a clear structure.")}</p><Button onClick={() => setEditor({})}>{uiText("Create the first department")}</Button></div>}
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !saving.current) setEditor(null); }}><DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editor?.department ? uiText("Manage department settings") : uiText("Configure department")}</DialogTitle><DialogDescription>{uiText("Set the department name, head, and groups. After saving, group leads report to the head by default.")}</DialogDescription></DialogHeader>
      {editor ? <DepartmentEditor key={editor.department?.id ?? "new"} companyId={companyId} data={data} department={editor.department} onPending={pending => { saving.current = pending; }} onSaved={async () => { setEditor(null); setNotice(uiText("Department settings saved")); await Promise.all([cache.invalidateQueries({ queryKey: organizationGroupsKey(companyId) }), cache.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) }), cache.invalidateQueries({ queryKey: queryKeys.org(companyId) })]); }} /> : null}
    </DialogContent></Dialog>
  </main>;
}

function DepartmentEditor({ companyId, data, department, onPending, onSaved }: {
  companyId: string; data: CompanyGroups & { pluginId: string }; department?: Department;
  onPending: (pending: boolean) => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(department?.name ?? "");
  const [headAgentId, setHeadAgentId] = useState(department?.headAgentId ?? "");
  const [teamIds, setTeamIds] = useState(data.teams.filter(team => department && team.departmentId === department.id).map(team => team.id));
  const submitRef = useRef(false);
  const selectable = data.teams.filter(team => !team.departmentId || team.departmentId === department?.id);
  const heads = data.agents.filter(agent => !["terminated", "pending_approval"].includes(agent.status))
    .sort((a, b) => Number(b.templateRole === "department_head") - Number(a.templateRole === "department_head"));
  const mutation = useMutation({ mutationFn: async () => {
    onPending(true);
    try {
      await improvementTeamsApi.saveDepartment(data.pluginId, { companyId, ...(department ? { departmentId: department.id } : {}), name: name.trim(), headAgentId: headAgentId || null, teamIds });
      await onSaved();
    } finally { submitRef.current = false; onPending(false); }
  } });
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!submitRef.current) { submitRef.current = true; mutation.mutate(); } }}>
    <fieldset disabled={mutation.isPending} className="space-y-4">
      <label className="block space-y-2"><span className="text-sm font-medium">{uiText("Department name")}</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
      <label className="block space-y-2"><span className="text-sm font-medium">{uiText("Department head")}</span><select value={headAgentId} onChange={event => setHeadAgentId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{uiText("Do not configure a department head yet")}</option>{heads.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.title ? ` · ${agent.title}` : ""}</option>)}</select></label>
      <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{uiText("Department groups · {count}", { count: teamIds.length })}</h3><Button type="button" size="sm" variant="ghost" disabled={!selectable.length} onClick={() => setTeamIds(selectable.map(team => team.id))}><WandSparkles className="size-4" />{uiText("Add all available groups")}</Button></div>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">{data.teams.map(team => {
          const other = Boolean(team.departmentId && team.departmentId !== department?.id);
          const owner = data.departments?.find(entry => entry.id === team.departmentId)?.name;
          return <label key={team.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"><input type="checkbox" checked={teamIds.includes(team.id)} disabled={other} onChange={event => setTeamIds(previous => event.target.checked ? [...previous, team.id] : previous.filter(id => id !== team.id))} /><span className="flex-1"><span className="block text-sm">{team.name}</span><span className="text-xs text-muted-foreground">{team.projectName || uiText("Responsible project")}</span></span>{other ? <span className="text-xs text-muted-foreground">{uiText("Belongs to {department}", { department: owner ?? uiText("Other department") })}</span> : null}</label>;
        })}{!data.teams.length ? <p className="p-2 text-sm text-muted-foreground">{uiText("No groups yet. Save the department first, then configure groups on the Groups page.")}</p> : null}</div>
        <p className="text-xs text-muted-foreground">{uiText("A group belongs to one department. Remove it from the current department before moving it.")}</p>
      </div>
    </fieldset>
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{uiText("Department save failed: {error}", { error: mutation.error.message })}</p> : null}
    <Button type="submit" className="w-full" disabled={!name.trim() || mutation.isPending}>{mutation.isPending ? uiText("Saving…") : uiText("Save department settings")}</Button>
  </form>;
}
