import { describe, expect, it } from "vitest";
import type { ExternalConversationEvent, ExternalConversationUsage } from "@/api/bridge";
import { assembleExternalEvents, externalEventText, externalUsageLabel } from "./external-conversations";

const event = (payload: Record<string, unknown>, id = "event"): ExternalConversationEvent => ({ id, eventKind: "conversation.turn.completed", sourceKey: id, payload, occurredAt: "2026-10-04T00:00:00Z" });
function chunkEvents(body: string) {
  const encoded = JSON.stringify({ conversation_history: [{ role: "user", content: "原始要求" }], assistant_response: body });
  return [encoded.slice(0, 30), encoded.slice(30)].map((text, index) => ({ ...event({}, `chunk-${index}`), eventKind: "conversation.turn.chunk", payload: { capture_id: "capture", chunk_index: index, chunk_count: 2, text, original_event_kind: "conversation.turn.completed" } }));
}

describe("external conversation evidence", () => {
  it("reads direct, data and transport envelope payloads without losing the final answer", () => {
    const payload = { conversation_history: [{ role: "user", content: [{ type: "text", text: "原始要求" }] }], assistant_response: "完整答复" };
    for (const wrapped of [payload, { data: payload }, { payload: { data: payload } }]) {
      expect(externalEventText(event(wrapped))).toContain("原始要求");
      expect(externalEventText(event(wrapped))).toContain("完整答复");
    }
  });
  it("does not append the same final assistant message twice", () => {
    const text = externalEventText(event({ conversation_history: [{ role: "assistant", content: "唯一答复" }], assistant_response: "唯一答复" }));
    expect(text?.match(/唯一答复/g)).toHaveLength(1);
  });
  it("reads the durable Hermes state.db backfill message shape", () => {
    expect(externalEventText(event({ snapshot: { messages: [{ role: "user", content: "历史全文" }] } }))).toContain("历史全文");
  });
  it("reassembles out-of-order chunks into the complete original body", () => {
    const body = "完整正文🙂".repeat(12000) + "最终结尾";
    const reconstructed = assembleExternalEvents(chunkEvents(body).reverse());
    expect(reconstructed).toHaveLength(1);
    expect(externalEventText(reconstructed[0])).toContain(body);
  });
  it("shows missing, conflicting and malformed chunks as incomplete evidence", () => {
    const chunks = chunkEvents("答复");
    expect(assembleExternalEvents([chunks[0]])[0].incompleteMessage).toContain("1/2");
    const conflict = { ...chunks[0], id: "conflict", payload: { ...chunks[0].payload, text: "different" } };
    expect(assembleExternalEvents([...chunks, conflict])[0].incompleteMessage).toBeTruthy();
    const malformed = chunks.map((chunk) => ({ ...chunk, payload: { ...chunk.payload, text: "invalid" } }));
    expect(assembleExternalEvents(malformed)[0].incompleteMessage).toContain("无法解析");
  });
  it("never reports an unknown or estimated price as a confirmed bill", () => {
    const usage = { pricingStatus: "unpriced", billingStatus: "unknown", amountMicroUsd: "0" } as ExternalConversationUsage;
    expect(externalUsageLabel(usage)).toBe("费用未知");
    expect(externalUsageLabel({ ...usage, pricingStatus: "estimated", billingStatus: "billed" })).toContain("尚未确认账单");
    expect(externalUsageLabel({ ...usage, pricingStatus: "priced", billingStatus: "billed", amountMicroUsd: "3001" })).toBe("已计费 $0.003001");
    expect(externalUsageLabel({ ...usage, billingStatus: "included" })).toBe("订阅已包含");
  });
});
