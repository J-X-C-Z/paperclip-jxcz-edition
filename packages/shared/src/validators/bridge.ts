import { z } from "zod";
import { BRIDGE_MAX_PAYLOAD_BYTES } from "../types/bridge.js";

export const bridgeBindingKindSchema = z.enum(["agent", "project", "issue", "goal", "conversation", "accounting_owner"]);

const nullableUuid = z.string().uuid().nullable().optional();

export const createBridgeBindingSchema = z.object({
  bindingKind: bridgeBindingKindSchema,
  externalKey: z.string().trim().min(1).max(512),
  agentId: nullableUuid,
  projectId: nullableUuid,
  issueId: nullableUuid,
  goalId: nullableUuid,
  conversationId: z.string().max(512).nullable().optional(),
}).strict();

export const createBridgeBindingRevisionSchema = z.object({
  agentId: nullableUuid,
  projectId: nullableUuid,
  issueId: nullableUuid,
  goalId: nullableUuid,
  conversationId: z.string().max(512).nullable().optional(),
}).strict();

export const bridgeQuerySchema = z.object({
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  bindingId: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(512).optional(),
  kind: bridgeBindingKindSchema.optional(),
  eventKind: z.string().trim().min(1).max(128).optional(),
  agentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  issueId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  groupBy: z.enum(["request", "session"]).optional(),
}).strict();

export const bridgeAppendEventSchema = z.object({
  bindingId: z.string().uuid(),
  bindingRevision: z.number().int().positive(),
  protocolVersion: z.literal(1),
  payloadVersion: z.number().int().positive(),
  eventKind: z.string().trim().min(1).max(128),
  sourceKind: z.string().trim().min(1).max(128),
  sourceKey: z.string().trim().min(1).max(512),
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
}).strict().superRefine((value, context) => {
  const size = new TextEncoder().encode(JSON.stringify(value.payload)).byteLength;
  if (size > BRIDGE_MAX_PAYLOAD_BYTES) {
    context.addIssue({ code: "custom", message: `payload exceeds ${BRIDGE_MAX_PAYLOAD_BYTES} bytes`, path: ["payload"] });
  }
});

export const bridgeUsageQuerySchema = bridgeQuerySchema.extend({ groupBy: z.enum(["request", "session"]).default("request") });

export type CreateBridgeBinding = z.infer<typeof createBridgeBindingSchema>;
export type CreateBridgeBindingRevision = z.infer<typeof createBridgeBindingRevisionSchema>;
export type BridgeQuery = z.infer<typeof bridgeQuerySchema>;
export type BridgeAppendEvent = z.infer<typeof bridgeAppendEventSchema>;
export type BridgeUsageQuery = z.infer<typeof bridgeUsageQuerySchema>;
