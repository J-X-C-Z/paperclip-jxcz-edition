import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { improvementTeamsApi, organizationGroupsKey, type CompanyGroups } from "@/api/improvementTeams";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";

export function ProjectOrganization({ companyId, projectId }: { companyId: string; projectId: string }) {
  const query = useQuery({ queryKey: organizationGroupsKey(companyId), queryFn: () => improvementTeamsApi.list(companyId) });
  return <section aria-label="项目所属部门和小组" className="space-y-4 rounded-lg border border-border p-4">
    <div className="space-y-1"><h2 className="font-semibold">所属部门和小组</h2><p className="text-sm text-muted-foreground">勾选项目关联的部门和小组。所选小组成员会加入项目团队。</p></div>
    {query.isPending ? <p className="text-sm text-muted-foreground">正在加载组织架构…</p> : query.data ?
      <OrganizationEditor key={`${companyId}:${projectId}`} companyId={companyId} projectId={projectId} data={query.data} /> : null}
    {query.error ? <p role="alert" className="text-sm text-destructive">加载组织架构失败：{query.error.message}<Button size="sm" variant="ghost" onClick={() => query.refetch()}>重试</Button></p> : null}
  </section>;
}

function OrganizationEditor({ companyId, projectId, data }: { companyId: string; projectId: string; data: CompanyGroups & { pluginId: string } }) {
  const cache = useQueryClient();
  const project = data.projects.find(entry => entry.id === projectId);
  const [teamIds, setTeamIds] = useState(() => project?.organizationTeamIds ?? data.teams.filter(team => team.projectId === projectId).map(team => team.id));
  const [departmentIds, setDepartmentIds] = useState(() => project?.organizationDepartmentIds ?? [...new Set(data.teams.filter(team => team.projectId === projectId && team.departmentId).map(team => team.departmentId!))]);
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  const linksSaved = useRef(false);
  const departments = data.departments ?? [];
  const mutation = useMutation({ mutationFn: async () => {
    linksSaved.current = false;
    setNotice("");
    const selection = await improvementTeamsApi.saveProjectOrganization(data.pluginId, { companyId, projectId, teamIds, departmentIds });
    linksSaved.current = true;
    for (const team of data.teams.filter(entry => selection.teamIds.includes(entry.id))) {
      const leadAgentId = team.members.find(member => member.role === "team_lead")?.agentId;
      if (!leadAgentId) continue;
      await improvementTeamsApi.syncMembers({ companyId, projectId, leadAgentId, memberAgentIds: team.members.map(member => member.agentId) });
    }
    setNotice("项目组织归属和小组成员已保存");
  }, onSettled: async () => {
    try {
      await Promise.all([
        cache.invalidateQueries({ queryKey: organizationGroupsKey(companyId) }),
        cache.invalidateQueries({ queryKey: queryKeys.projects.agentMemberships(companyId, projectId) }),
      ]);
    } finally { saving.current = false; }
  } });
  function toggle(current: string[], id: string, checked: boolean) { return checked ? [...new Set([...current, id])] : current.filter(entry => entry !== id); }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!saving.current) { saving.current = true; mutation.mutate(); } }}>
    <fieldset disabled={mutation.isPending} className="space-y-4">
      <div className="space-y-2"><h3 className="text-sm font-medium">部门</h3><div className="flex flex-wrap gap-3">{departments.map(department => <label key={department.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={departmentIds.includes(department.id)} onChange={event => { setNotice(""); setDepartmentIds(previous => toggle(previous, department.id, event.target.checked)); }} />{department.name}</label>)}{!departments.length ? <p className="text-sm text-muted-foreground">暂无部门，可在组织架构中配置。</p> : null}</div></div>
      <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">小组 · {teamIds.length}</h3><Button type="button" size="sm" variant="outline" disabled={!departmentIds.length} onClick={() => { setNotice(""); setTeamIds(previous => [...new Set([...previous, ...data.teams.filter(team => team.departmentId && departmentIds.includes(team.departmentId)).map(team => team.id)])]); }}>勾选所选部门的小组</Button></div>
        <div className="max-h-64 space-y-1 overflow-y-auto">{data.teams.map(team => <label key={team.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"><input type="checkbox" checked={teamIds.includes(team.id)} onChange={event => { setNotice(""); setTeamIds(previous => toggle(previous, team.id, event.target.checked)); }} /><span className="flex-1 text-sm">{team.name}<span className="ml-2 text-xs text-muted-foreground">{departments.find(department => department.id === team.departmentId)?.name ?? "未分配部门"} · {team.members.length} 位成员</span></span></label>)}{!data.teams.length ? <p className="text-sm text-muted-foreground">暂无小组，可在组织架构中配置。</p> : null}</div>
      </div>
      <p className="text-xs text-muted-foreground">取消关联后，已加入的项目成员仍可在“团队”中单独管理。</p>
    </fieldset>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{linksSaved.current ? "组织归属已保存，小组成员同步失败" : "保存失败"}：{mutation.error.message}，可再次保存重试。</p> : null}
    <Button type="submit" size="sm" disabled={mutation.isPending}>{mutation.isPending ? "正在保存…" : "保存项目组织归属"}</Button>
  </form>;
}
