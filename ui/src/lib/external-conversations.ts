import type { ExternalConversationEvent, ExternalConversationUsage } from "@/api/bridge";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function externalEventData(payload: Record<string, unknown>) {
  let data = payload;
  for (let depth = 0; depth < 4; depth++) {
    const nested = record(data.data) ?? record(data.payload);
    if (!nested) break;
    data = nested;
  }
  return data;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => {
    const block = record(part);
    return typeof block?.text === "string" ? block.text : JSON.stringify(part, null, 2);
  }).join("\n\n");
  return content == null ? "" : JSON.stringify(content, null, 2);
}

export function externalEventText(event: ExternalConversationEvent): string | null {
  const data = externalEventData(event.payload);
  const snapshot = record(data.snapshot);
  const history = data.conversation_history ?? snapshot?.messages;
  if (Array.isArray(history)) {
    const messages = history.map((message) => record(message)).filter((message) => message !== null);
    const parts = messages.map((message) => `**${({ user: "用户", assistant: "助手", system: "系统", tool: "工具" } as Record<string, string>)[String(message.role)] ?? "消息"}**\n\n${contentText(message.content)}`);
    const response = contentText(data.assistant_response);
    const last = messages.at(-1);
    if (response && !(last?.role === "assistant" && contentText(last.content) === response)) parts.push(`**助手**\n\n${response}`);
    return parts.join("\n\n---\n\n") || null;
  }
  for (const key of ["assistant_response", "response", "text", "content", "result"]) {
    if (typeof data[key] === "string") return data[key];
  }
  return null;
}

export type DisplayExternalEvent = ExternalConversationEvent & { incompleteMessage?: string };

export function assembleExternalEvents(events: ExternalConversationEvent[]): DisplayExternalEvent[] {
  const groups = new Map<string, ExternalConversationEvent[]>();
  for (const event of events) {
    const payload = externalEventData(event.payload);
    if (event.eventKind === "conversation.turn.chunk" && typeof payload.capture_id === "string") {
      const group = groups.get(payload.capture_id) ?? [];
      group.push(event);
      groups.set(payload.capture_id, group);
    }
  }
  const seen = new Set<string>();
  return events.flatMap((event): DisplayExternalEvent[] => {
    if (seen.has(event.id)) return [];
    seen.add(event.id);
    if (event.eventKind !== "conversation.turn.chunk") return [event];
    const payload = externalEventData(event.payload);
    const key = payload.capture_id;
    if (typeof key !== "string") return [{ ...event, incompleteMessage: "会话分段缺少来源标识，无法组装正文。" }];
    const group = groups.get(key)!;
    if (group[0] !== event) return [];
    const count = Number(payload.chunk_count);
    const parts = new Map<number, string>();
    let valid = Number.isSafeInteger(count) && count > 0;
    for (const chunk of group) {
      const data = externalEventData(chunk.payload);
      const index = Number(data.chunk_index);
      if (!Number.isSafeInteger(index) || index < 0 || index >= count || data.chunk_count !== payload.chunk_count
        || data.original_event_kind !== payload.original_event_kind || typeof data.text !== "string"
        || (parts.has(index) && parts.get(index) !== data.text)) { valid = false; continue; }
      parts.set(index, data.text);
    }
    if (!valid || parts.size !== count) return [{ ...event, incompleteMessage: `会话正文尚未完整同步（已收到 ${parts.size}/${Number.isSafeInteger(count) && count > 0 ? count : "未知"} 段），刷新后重试。` }];
    try {
      const reconstructed = record(JSON.parse(Array.from({ length: count }, (_, index) => parts.get(index)).join("")));
      if (!reconstructed) throw new Error("invalid payload");
      return [{ ...event, eventKind: typeof payload.original_event_kind === "string" ? payload.original_event_kind : "conversation.turn.completed", payload: reconstructed }];
    } catch {
      return [{ ...event, incompleteMessage: "会话分段内容无法解析，请检查同步来源。" }];
    }
  });
}

function money(amount: string) {
  if (!/^\d+$/.test(amount)) return null;
  const value = BigInt(amount);
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `$${value / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export function externalUsageLabel(usage: ExternalConversationUsage) {
  if (usage.billingStatus === "included") return "订阅已包含";
  if (usage.billingStatus === "not_billable") return "不计实际支出";
  if (usage.pricingStatus === "estimated") return "参考估算，尚未确认账单";
  if (usage.billingStatus === "billed" && usage.pricingStatus === "priced") {
    const amount = money(usage.amountMicroUsd);
    if (amount !== null) return `已计费 ${amount}`;
  }
  return "费用未知";
}
