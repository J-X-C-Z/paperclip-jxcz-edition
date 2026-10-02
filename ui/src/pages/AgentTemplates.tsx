import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENT_TEMPLATES, type AgentTemplate } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { TemplateSkillsField } from "@/components/new-agent/TemplateSkillsField";
import { useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function TemplateEditor({ companyId, template }: { companyId: string; template: AgentTemplate }) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [skills, setSkills] = useState(template.skills);
  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt);
  const [saved, setSaved] = useState(false);
  const dirty = systemPrompt !== template.systemPrompt || JSON.stringify([...skills].sort()) !== JSON.stringify([...template.skills].sort());
  const mutation = useMutation({
    mutationFn: () => agentsApi.updateTemplateDefaults(companyId, template.id, { skills, systemPrompt }),
    onSuccess: (updated) => {
      cache.setQueryData<AgentTemplate[]>(["agent-templates", companyId], (previous) =>
        previous?.map(entry => entry.id === updated.id ? updated : entry));
      setSkills(updated.skills);
      setSystemPrompt(updated.systemPrompt);
      setSaved(true);
    },
  });
  const change = (next: string[]) => { setSkills(next); setSaved(false); mutation.reset(); };
  return <section className="space-y-6 rounded-lg border border-border bg-card p-6" aria-label={`${template.name}模板`}>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{template.name}</h2>
        <Button variant="outline" size="sm" onClick={() => navigate(`/agents/new?${new URLSearchParams({ templateId: template.id })}`)}>使用{template.name}模板</Button>
      </div>
      <p className="text-sm text-muted-foreground">{template.description}</p>
      <p className="font-mono text-xs text-muted-foreground">{template.model.modelId}</p>
    </div>
    <div className="space-y-3">
      <h3 className="text-sm font-medium">默认 Skills · {skills.length}</h3>
      <fieldset disabled={mutation.isPending}><TemplateSkillsField companyId={companyId} value={skills} onChange={change}
        description="从 Skills 目录或当前组织中选择。新建智能体时会默认配备这些 Skills，也可以在创建时单独调整。" /></fieldset>
    </div>
    <div className="space-y-3">
      <label htmlFor={`${template.id}-instructions`} className="text-sm font-medium">默认 Instructions · AGENTS.md</label>
      <p className="text-sm text-muted-foreground">填写 Markdown 指令。使用此模板新建智能体时，会默认加载这份 AGENTS.md；已有智能体保持自己的指令。</p>
      <Textarea id={`${template.id}-instructions`} aria-label={`${template.name}模板 Instructions（AGENTS.md）`} rows={12} maxLength={100_000}
        value={systemPrompt} disabled={mutation.isPending} onChange={event => { setSystemPrompt(event.target.value); setSaved(false); mutation.reset(); }} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" disabled={mutation.isPending} onClick={() => {
        const builtin = AGENT_TEMPLATES.find(entry => entry.id === template.id);
        change([...(builtin?.skills ?? [])]);
        setSystemPrompt(builtin?.systemPrompt ?? "");
      }}>恢复内置默认</Button>
      <div className="flex items-center gap-3">
        {saved && !dirty ? <span role="status" className="text-sm text-muted-foreground">已保存</span> : null}
        {dirty ? <span className="text-xs text-muted-foreground">未保存</span> : null}
        <Button disabled={!dirty || !systemPrompt.trim() || systemPrompt.length > 100_000 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "正在保存…" : "保存模板默认设置"}</Button>
      </div>
    </div>
    {mutation.error ? <p role="alert" className="text-sm text-destructive">保存失败：{mutation.error.message}</p> : null}
  </section>;
}

export function AgentTemplates() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const templates = useQuery({
    queryKey: ["agent-templates", selectedCompanyId],
    queryFn: () => agentsApi.templates(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId), retry: false,
  });
  useEffect(() => { setBreadcrumbs([{ label: "组织架构", href: "/agents" }, { label: "模板" }]); }, [setBreadcrumbs]);
  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">请先选择组织。</p>;
  return <div className="space-y-6">
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">智能体模板</h1>
      <p className="text-sm text-muted-foreground">选择部长、组长、组员或自定义模板创建智能体。创建时可设置职位、模型、职责和 Skills；这里保存的默认 Skills 和 Markdown Instructions 用于后续新建智能体。</p>
    </div>
    {templates.isPending ? <p role="status" className="text-sm text-muted-foreground">正在加载模板…</p> : null}
    {templates.error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">模板加载失败，请重试。</p><Button variant="outline" onClick={() => void templates.refetch()}>重试</Button></div> : null}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {(templates.data ?? []).map(template => <TemplateEditor key={`${selectedCompanyId}:${template.id}`} companyId={selectedCompanyId} template={template} />)}
    </div>
  </div>;
}
