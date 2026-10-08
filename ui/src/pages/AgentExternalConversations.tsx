import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MessageSquare, RefreshCw } from "lucide-react";
import { bridgeApi } from "@/api/bridge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import { PageSkeleton } from "@/components/PageSkeleton";
import { relativeTime } from "@/lib/utils";
import { assembleExternalEvents, externalEventText, externalUsageLabel } from "@/lib/external-conversations";

export function AgentExternalConversations({ companyId, agentId }: { companyId: string; agentId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sessions = useInfiniteQuery({
    queryKey: ["bridge", companyId, "conversations", agentId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => bridgeApi.conversations(companyId, agentId, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15_000,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return sessions.data?.pages.flatMap((page) => page.items).filter((item) => {
      if (seen.has(item.conversationId)) return false;
      seen.add(item.conversationId);
      return true;
    }) ?? [];
  }, [sessions.data]);
  const selected = items.find((item) => item.conversationId === selectedId) ?? items[0];
  const detail = useQuery({
    queryKey: ["bridge", companyId, "conversation", selected?.conversationId],
    queryFn: () => bridgeApi.conversation(companyId, selected!.conversationId),
    enabled: Boolean(selected),
    refetchInterval: 15_000,
  });
  const events = useMemo(() => assembleExternalEvents(detail.data?.events ?? []), [detail.data?.events]);

  if (sessions.isLoading) return <PageSkeleton />;
  if (sessions.error) return <div className="space-y-3"><p role="alert" className="text-sm text-destructive">外部会话读取失败：{sessions.error.message}</p><Button variant="outline" onClick={() => sessions.refetch()}>重试</Button></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">云端 Hermes 的会话、工具与用量。费用未知或待核对时会明确显示。</p>
      <Button variant="outline" size="sm" disabled={sessions.isFetching || detail.isFetching} onClick={() => { void sessions.refetch(); if (selected) void detail.refetch(); }}><RefreshCw className="size-4" />刷新</Button>
    </div>
    {items.length === 0 ? <EmptyState icon={MessageSquare} message="尚未同步外部会话。接入 Hermes Bridge 后，真实对话将在这里显示。" /> : <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-2">
        {items.map((item) => <Button key={item.conversationId} aria-pressed={selected?.conversationId === item.conversationId} variant={selected?.conversationId === item.conversationId ? "secondary" : "ghost"} className="h-auto w-full justify-start py-3 text-left" onClick={() => setSelectedId(item.conversationId)}><span className="min-w-0 space-y-1"><span className="block truncate font-mono text-xs">{item.conversationId}</span><span className="block text-xs text-muted-foreground">{relativeTime(item.updatedAt)}</span></span></Button>)}
        {sessions.hasNextPage && <Button variant="outline" onClick={() => sessions.fetchNextPage()} disabled={sessions.isFetchingNextPage}>更多会话</Button>}
      </div>
      <div className="space-y-6 lg:col-span-2">
        {detail.isLoading && <PageSkeleton />}
        {detail.error && <div className="space-y-3"><p role="alert" className="text-sm text-destructive">会话正文读取失败：{detail.error.message}</p><Button variant="outline" onClick={() => detail.refetch()}>重试正文</Button></div>}
        {detail.data && <>
          <div className="space-y-2"><h3 className="text-sm font-medium">用量与费用</h3>{detail.data.usage.length === 0 ? <p className="text-sm text-muted-foreground">尚无可核对的用量数据，费用未知。</p> : detail.data.usage.map((usage) => <div key={usage.id} className="flex flex-wrap gap-3 font-mono text-xs text-muted-foreground"><span>输入 {usage.inputTokens} · 输出 {usage.outputTokens}</span><span>{externalUsageLabel(usage)}</span><span>{usage.accountingStatus === "reconciliation_required" ? "归属待核对" : "归属已确认"}</span></div>)}</div>
          {events.length === 0 && <p className="text-sm text-muted-foreground">正文尚未同步，请稍后刷新。</p>}
          {events.map((event) => {
            const text = event.incompleteMessage ? null : externalEventText(event);
            return <article key={event.id} className="space-y-3 rounded-md border border-border p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{event.eventKind.startsWith("tool.") ? "工具调用" : event.eventKind.startsWith("conversation.") ? "会话记录" : event.eventKind}</span><span>{relativeTime(event.occurredAt)}</span></div>{event.incompleteMessage && <p role="status" className="text-sm text-muted-foreground">{event.incompleteMessage}</p>}{text && <MarkdownBody>{text}</MarkdownBody>}<details><summary className="cursor-pointer text-sm">查看来源记录</summary><pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{JSON.stringify(event.payload, null, 2)}</pre></details></article>;
          })}
        </>}
      </div>
    </div>}
  </div>;
}
