export const BRIDGE_PROTOCOL_SCHEMA = "paperclip_bridge_v1" as const;
export const BRIDGE_MAX_PAYLOAD_BYTES = 65_536;

export type BridgeBindingKind = "agent" | "project" | "issue" | "goal" | "conversation" | "accounting_owner";
export type BridgeReceiptState = "pending" | "leased" | "completed" | "retry" | "quarantined";
export type BridgeUsageGranularity = "request" | "session";

export interface BridgeBindingRevision {
  bindingId: string;
  revision: number;
  companyId: string;
  bindingKind: BridgeBindingKind;
  externalKey: string;
  agentId: string | null;
  projectId: string | null;
  issueId: string | null;
  goalId: string | null;
  conversationId: string | null;
  accountingOwnerAgentId: string | null;
  validFrom: string;
  validUntil: string | null;
}

export interface BridgeSnapshot {
  id: string;
  companyId: string;
  bindingId: string;
  bindingRevision: number;
  snapshotKey: string;
  version: string;
  tombstone: boolean;
  payload: Record<string, unknown>;
  publishedAt: string;
}

export interface BridgeEventSummary {
  id: string;
  companyId: string;
  bindingId: string;
  bindingRevision: number;
  protocolVersion: number;
  payloadVersion: number;
  eventKind: string;
  sourceKind: string;
  sourceKey: string;
  payloadSha256: string;
  occurredAt: string;
  receivedAt: string;
}

export interface BridgeReceipt {
  id: string;
  eventId: string;
  consumer: string;
  state: BridgeReceiptState;
  attempt: number;
  retryAt: string | null;
  lastError: string | null;
}

export interface BridgeConversationIndexEntry {
  conversationId: string;
  agentId: string | null;
  projectId: string | null;
  issueId: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface BridgeUsageProjection {
  id: string;
  sourceKind: string;
  sourceKey: string;
  granularity: BridgeUsageGranularity;
  sessionKey: string;
  accountingOwnerAgentId: string | null;
  accountingStatus: "attributed" | "reconciliation_required";
  pricingStatus: "priced" | "unpriced" | "estimated";
  billingStatus: "billed" | "included" | "unknown" | "not_billable";
  /** Integer micro-USD encoded as a decimal string to preserve exactness. */
  amountMicroUsd: string;
  inputTokens: string;
  outputTokens: string;
  occurredAt: string;
}

export interface BridgePage<T> {
  items: T[];
  nextCursor: string | null;
}
