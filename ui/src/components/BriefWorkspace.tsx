import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileText, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { briefsApi, briefsKeys } from "@/api/briefs";
import { builtInAgentsApi } from "@/api/builtInAgents";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { relativeTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ConfigureBuiltInAgentModal } from "@/components/ConfigureBuiltInAgentModal";

export function BriefWorkspace({ companyId, projectId }: { companyId: string; projectId?: string | null }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [builtInOpen, setBuiltInOpen] = useState(false);
  const [secretaryId, setSecretaryId] = useState<string | undefined>(undefined);
  const briefs = useQuery({
    queryKey: briefsKeys.list(companyId, projectId),
    queryFn: () => briefsApi.list(companyId, projectId),
    refetchInterval: 30_000,
  });
  const settings = useQuery({ queryKey: briefsKeys.settings(companyId), queryFn: () => briefsApi.settings(companyId) });
  const builtIns = useQuery({
    queryKey: queryKeys.builtInAgents.list(companyId),
    queryFn: () => builtInAgentsApi.list(companyId),
    enabled: builtInOpen,
  });
  const agents = useQuery({ queryKey: queryKeys.agents.list(companyId), queryFn: () => agentsApi.list(companyId), enabled: configureOpen });
  const saveSecretary = useMutation({
    mutationFn: () => briefsApi.updateSettings(companyId, (secretaryId ?? settings.data?.secretaryAgentId) || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: briefsKeys.settings(companyId) });
      setConfigureOpen(false);
    },
  });
  const secretaryState = builtIns.data?.find((state) => state.definition.key === "briefs");
  const generate = useMutation({
    mutationFn: () => briefsApi.generate(companyId, projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: briefsKeys.all(companyId) }),
  });
  const secretary = settings.data?.secretaryAgent;
  const selected = briefs.data?.find((brief) => brief.id === selectedId) ?? briefs.data?.[0];
  const unavailable = settings.data && (!settings.data.enabled || !secretary || secretary.status === "paused" || secretary.status === "terminated");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{projectId ? "项目简报" : "简报"}</h2>
          <p className="text-sm text-muted-foreground">秘书整理原始需求、当前进展、待决事项和验收证据，完成后归档。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => briefs.refetch()} disabled={briefs.isFetching}>
            <RefreshCw className="h-4 w-4" />刷新
          </Button>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending || settings.isLoading || Boolean(unavailable) || Boolean(settings.error)}>
            <Sparkles className="h-4 w-4" />{generate.isPending ? "正在提交…" : "生成简报"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {settings.isLoading ? "正在读取秘书配置…" : secretary ? (
            <span>简报秘书：<Link className="font-medium hover:underline" to={`/agents/${secretary.id}`}>{secretary.name}</Link>{unavailable ? " · 当前不可生成" : " · 已配置"}</span>
          ) : "配置简报秘书，开始生成和归档。"}
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfigureOpen(true)}>配置秘书</Button>
      </div>
      {configureOpen && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <label className="flex flex-col gap-2 text-sm">
            简报秘书
            <select className="rounded-md border border-input bg-background px-3 py-2" value={secretaryId ?? settings.data?.secretaryAgentId ?? ""} onChange={(event) => setSecretaryId(event.target.value)} disabled={agents.isLoading}>
              <option value="">使用内置简报秘书</option>
              {agents.data?.filter((agent) => agent.status !== "terminated").map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfigureOpen(false)}>取消</Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBuiltInOpen(true)}>配置内置秘书</Button>
              <Button size="sm" onClick={() => saveSecretary.mutate()} disabled={saveSecretary.isPending || agents.isLoading || Boolean(agents.error)}>{saveSecretary.isPending ? "保存中…" : "保存"}</Button>
            </div>
          </div>
        </div>
      )}
      {[settings.error, briefs.error, generate.error, saveSecretary.error, configureOpen ? agents.error : null, builtInOpen ? builtIns.error : null].filter(Boolean).map((error, index) => (
        <p key={index} role="alert" className="text-sm text-destructive">{(error as Error).message}</p>
      ))}
      {builtInOpen && builtIns.isLoading && <p className="text-sm text-muted-foreground">正在读取秘书设置…</p>}
      {builtInOpen && builtIns.data && !secretaryState && <p role="alert" className="text-sm text-destructive">当前实例未提供简报秘书配置，请选择公司代理或检查内置代理设置。</p>}
      {generate.data && (
        <p role="status" className="text-sm text-muted-foreground">
          已交给秘书生成。<Link className="text-foreground underline" to={`/issues/${generate.data.issueId}`}>查看生成任务</Link>，完成并投送后会出现在下方。
        </p>
      )}
      {briefs.isLoading ? <PageSkeleton variant="list" /> : briefs.data?.length === 0 ? (
        <EmptyState icon={FileText} title="还没有归档简报" message="生成任务完成并投送后，简报会保存在这里，可随时回看。" />
      ) : selected ? (
        <div className="flex flex-col gap-6 lg:flex-row">
          <nav aria-label="简报历史" className="flex shrink-0 flex-col gap-2 lg:w-64">
            {briefs.data?.map((brief) => (
              <button key={brief.id} type="button" aria-pressed={brief.id === selected.id} onClick={() => setSelectedId(brief.id)}
                className={cn("flex flex-col gap-1 rounded-lg p-3 text-left transition-colors", brief.id === selected.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}>
                <span className="text-sm font-medium">{brief.title}</span>
                <span className="text-xs text-muted-foreground">{relativeTime(brief.createdAt)}</span>
              </button>
            ))}
          </nav>
          <article className="min-w-0 flex-1 space-y-4 rounded-lg border border-border p-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{selected.title}</h3>
              {selected.authorAgentName && <p className="text-xs text-muted-foreground">署名：{selected.authorAgentName}</p>}
              <p className="text-xs text-muted-foreground">归档于 <time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleString()}</time></p>
            </div>
            <MarkdownBody>{selected.body}</MarkdownBody>
            {selected.issueId && <Link className="text-sm text-muted-foreground underline" to={`/issues/${selected.issueId}`}>查看生成任务与执行记录</Link>}
            {selected.sourceRefs?.length > 0 && (
              <details className="space-y-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer">资料来源（{selected.sourceRefs.length}）</summary>
                <ul className="space-y-1">
                  {selected.sourceRefs.map((source, index) => <li key={index} className="break-all">{source}</li>)}
                </ul>
              </details>
            )}
          </article>
        </div>
      ) : null}
      {secretaryState && <ConfigureBuiltInAgentModal key={`${companyId}:${secretaryState.agentId ?? "new"}`} companyId={companyId} state={secretaryState}
        open={builtInOpen} onOpenChange={(open) => {
          setBuiltInOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: briefsKeys.settings(companyId) });
        }} />}
    </div>
  );
}
