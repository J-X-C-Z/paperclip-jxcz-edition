import { describe, expect, it } from "vitest";
import { bridgeAppendEventSchema, bridgeQuerySchema, createBridgeBindingSchema, createBridgeBindingRevisionSchema } from "./bridge.js";

const validEvent = {
  bindingId: "00000000-0000-4000-8000-000000000001",
  bindingRevision: 1,
  protocolVersion: 1,
  payloadVersion: 1,
  eventKind: "message.created",
  sourceKind: "hermes_message",
  sourceKey: "message-1",
  payloadSha256: "a".repeat(64),
  occurredAt: "2026-10-03T00:00:00.000Z",
  payload: { text: "hello" },
};

describe("Bridge contracts", () => {
  it("does not accept caller-selected accounting owners", () => {
    expect(createBridgeBindingSchema.safeParse({
      bindingKind: "conversation",
      externalKey: "conversation-1",
      agentId: "00000000-0000-4000-8000-000000000001",
      accountingOwnerAgentId: "00000000-0000-4000-8000-000000000002",
    }).success).toBe(false);
    expect(createBridgeBindingRevisionSchema.safeParse({
      accountingOwnerAgentId: "00000000-0000-4000-8000-000000000002",
    }).success).toBe(false);
  });

  it("requires protocol v1 and rejects payloads above 64 KiB", () => {
    expect(bridgeAppendEventSchema.safeParse({ ...validEvent, protocolVersion: 2 }).success).toBe(false);
    expect(bridgeAppendEventSchema.safeParse({ ...validEvent, payload: { text: "x".repeat(65_537) } }).success).toBe(false);
  });

  it("accepts a small versioned event and denies arbitrary top-level authority fields", () => {
    expect(bridgeAppendEventSchema.safeParse(validEvent).success).toBe(true);
    expect(bridgeAppendEventSchema.safeParse({ ...validEvent, companyId: "00000000-0000-4000-8000-000000000003" }).success).toBe(false);
  });

  it("allows the documented snapshot key query and rejects undeclared query fields", () => {
    expect(bridgeQuerySchema.safeParse({ key: "memory/main", limit: "20" }).success).toBe(true);
    expect(bridgeQuerySchema.safeParse({ key: "memory/main", ownerAgentId: "forged" }).success).toBe(false);
  });
});
