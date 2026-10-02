import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { companySkillsApi } from "@/api/companySkills";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function TemplateSkillsField({ companyId, value, onChange, description }: { companyId: string; value: string[]; onChange: (value: string[]) => void; description?: string }) {
  const [search, setSearch] = useState("");
  const catalog = useQuery({ queryKey: ["skills-catalog", "agent-template"], queryFn: () => companySkillsApi.catalogList(), retry: false });
  const company = useQuery({ queryKey: queryKeys.companySkills.list(companyId), queryFn: () => companySkillsApi.list(companyId), retry: false });
  const choices = new Map((catalog.data ?? []).map((skill) => [skill.key, { key: skill.key, name: skill.name }]));
  for (const skill of company.data ?? []) choices.set(skill.key, { key: skill.key, name: skill.name });
  const filtered = [...choices.values()].filter((skill) => value.includes(skill.key) || `${skill.name} ${skill.key}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(value.includes(b.key)) - Number(value.includes(a.key)) || a.name.localeCompare(b.name));
  const missing = value.filter((key) => !choices.has(key));
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{description ?? "从目录或当前组织选择 Skills；创建时配置，并在运行时同步。此处显示所选项，不表示已安装。"}</p>
    <Input aria-label="搜索 Skills" placeholder="搜索 Skills" value={search} onChange={(event) => setSearch(event.target.value)} />
    {catalog.isPending || company.isPending ? <p role="status" className="text-xs text-muted-foreground">正在加载 Skills…</p> : null}
    {catalog.error || company.error ? <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Skills 加载失败，请重试。</p><Button variant="outline" type="button" onClick={() => { void catalog.refetch(); void company.refetch(); }}>重试</Button></div> : null}
    <div className="max-h-64 space-y-2 overflow-y-auto">
      {filtered.map((skill) => <label className="flex items-start gap-3 text-sm" key={skill.key}>
        <input type="checkbox" aria-label={skill.name} checked={value.includes(skill.key)} onChange={(event) => onChange(event.target.checked ? [...value, skill.key] : value.filter((key) => key !== skill.key))} />
        <span>{skill.name}<span className="block break-all font-mono text-xs text-muted-foreground">{skill.key}</span></span>
      </label>)}
      {!catalog.isPending && !company.isPending ? missing.map((key) => <div key={key} className="flex items-center gap-3 text-sm"><span className="break-all text-muted-foreground">{key}（目录不可用）</span><Button type="button" variant="ghost" onClick={() => onChange(value.filter((entry) => entry !== key))}>移除</Button></div>) : null}
    </div>
  </div>;
}
