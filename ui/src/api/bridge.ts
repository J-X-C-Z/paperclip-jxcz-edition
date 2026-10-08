import { api } from "./client";
import type { BridgeConversationIndexEntry, BridgePage, BridgeUsageProjection } from "@paperclipai/shared";

export interface ExternalConversationEvent {
  id: string;
  eventKind: string;
  sourceKey: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}
export interface ExternalConversationDetail {
  conversation: BridgeConversationIndexEntry;
  events: ExternalConversationEvent[];
  usage: ExternalConversationUsage[];
}
export type ExternalConversationUsage = Omit<BridgeUsageProjection, "inputTokens" | "outputTokens"> & {
  inputTokens: string | number;
  outputTokens: string | number;
};

export const bridgeApi = {
  conversations: (companyId: string, agentId: string, cursor?: string) =>
    api.get<BridgePage<BridgeConversationIndexEntry>>(`/companies/${companyId}/bridge/conversations?agentId=${encodeURIComponent(agentId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  conversation: (companyId: string, conversationId: string) =>
    api.get<ExternalConversationDetail>(`/companies/${companyId}/bridge/conversations/${encodeURIComponent(conversationId)}`),
};
