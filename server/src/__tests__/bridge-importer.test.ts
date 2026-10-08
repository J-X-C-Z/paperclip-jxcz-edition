import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { agents, companies, bridgeBindings, bridgeBindingRevisions, bridgeEvents, bridgeReceipts, bridgeUsageProjection, costEvents, createDb, startEmbeddedPostgresTestDatabase } from "@paperclipai/db";
import { bridgeImporter } from "../services/bridge-importer.js";
import { bridgeStorage } from "../services/bridge-storage.js";

describe("Bridge transactional importer", () => {
  let db: ReturnType<typeof createDb>;
  let cleanup: (() => Promise<void>) | undefined;
  let importer: ReturnType<typeof bridgeImporter>;
  const companyId = randomUUID();
  const agentId = randomUUID();
  const bindingId = randomUUID();
  const sessionId = "external-session";
  const date = new Date();
  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("paperclip-bridge-importer-");
    cleanup = started.cleanup;
    db = createDb(started.connectionString);
    importer = bridgeImporter(db);
    await db.insert(companies).values({ id: companyId, name: "Bridge test", issuePrefix: "BRT" });
    await db.insert(agents).values({ id: agentId, companyId, name: "Trusted binding owner" });
    await db.insert(bridgeBindings).values({ id: bindingId, companyId, bindingKind: "agent", externalKey: "hermes" });
    await db.insert(bridgeBindingRevisions).values({ bindingId, revision: 1, companyId, agentId, accountingOwnerAgentId: agentId, validFrom: new Date("2020-01-01") });
  }, 90_000);
  afterAll(async () => { await cleanup?.(); });

  async function event(eventKind: string, payload: Record<string, unknown>) {
    const [row] = await db.insert(bridgeEvents).values({ companyId, bindingId, bindingRevision: 1,
      protocolVersion: 1, payloadVersion: 1, eventKind, sourceKind: "hermes", sourceKey: randomUUID(),
      payload, payloadBytes: JSON.stringify(payload).length, payloadSha256: "0".repeat(64), occurredAt: date }).returning();
    return row!;
  }
  it("indexes full conversation and tool payload without heartbeat or bot activity, scoped by company", async () => {
    const row = await event("conversation.turn.completed", { sessionId, conversation_history: [{ role: "user", content: "full text" }], assistant_response: "reply", agentId: randomUUID() });
    await importer.importEvent(row);
    await importer.importEvent(await event("tool.completed", { sessionId, tool_name: "read_file", result: "complete tool result" }));
    const conversation = await bridgeStorage(db).readConversation(companyId, sessionId);
    expect(conversation?.conversation.agentId).toBe(agentId);
    expect(conversation?.events).toHaveLength(2);
    expect(await bridgeStorage(db).readConversation(randomUUID(), sessionId)).toBeNull();
    const [{ runs, activity }] = await db.execute<{runs: number; activity: number}>(sql`select (select count(*)::int from heartbeat_runs) as runs, (select count(*)::int from activity_log) as activity`);
    expect(runs).toBe(0); expect(activity).toBe(0);
  });
  it.each([["model.request.completed", 1.25], ["model.auxiliary_request.completed", 1.25]] as const)("projects %s usage but only accounts explicitly priced billed USD, exactly once", async (eventKind, expectedCents) => {
    const ledgerBefore = await db.select().from(costEvents);
    const unknown = await event(eventKind, { sessionId, usage: { input_tokens: 20, output_tokens: 30 }, estimated_cost: 1.2 });
    await importer.importEvent(unknown);
    expect(await db.select().from(costEvents)).toHaveLength(ledgerBefore.length);
    const billed = await event(eventKind, { sessionId, provider: "provider", model: "model", usage: { input_tokens: 4, output_tokens: 5 }, cost: { currency: "USD", billingStatus: "billed", pricingStatus: "priced", billedAmountMicroUsd: "12500" } });
    await Promise.all([importer.importEvent(billed), importer.importEvent(billed)]);
    const ledger = await db.select().from(costEvents).where(eq(costEvents.id, billed.id));
    expect(ledger).toHaveLength(1); expect(ledger[0]?.agentId).toBe(agentId);
    expect(ledger[0]?.billedUsdMicros).toBe(12500n);
    // Decimal receipts preserve each event without residual cent rounding.
    expect(ledger[0]?.costCents).toBe(expectedCents);
    const projections = await db.select().from(bridgeUsageProjection).where(eq(bridgeUsageProjection.id, billed.id));
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({ inputTokens: 4, outputTokens: 5, amountMicroUsd: "12500" });
    const [unknownProjection] = await db.select().from(bridgeUsageProjection).where(eq(bridgeUsageProjection.id, unknown.id));
    expect(unknownProjection).toMatchObject({ inputTokens: 20, outputTokens: 30, billingStatus: "unknown", amountMicroUsd: "0" });
    const [owner] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(owner?.spentMonthlyCents).toBe(ledgerBefore.reduce((total, row) => total + row.costCents, 0) + ledger[0]!.costCents);
  });
  it("rolls back projection and accounting on bad billed amount, persists a retry receipt", async () => {
    const bad = await event("model.request.completed", { sessionId, cost: { currency: "USD", billingStatus: "billed", pricingStatus: "priced", billedAmountMicroUsd: "9999999999999999999999999999" } });
    await importer.sweepPending();
    expect(await db.select().from(bridgeUsageProjection).where(eq(bridgeUsageProjection.id, bad.id))).toHaveLength(0);
    const [receipt] = await db.select().from(bridgeReceipts).where(and(eq(bridgeReceipts.eventId, bad.id), eq(bridgeReceipts.consumer, "paperclip")));
    expect(receipt?.state).toBe("retry"); expect(receipt?.attempt).toBe(1);
    expect(await db.select().from(costEvents)).toHaveLength(2);
  });
  it("reassembles chunks only after every part has arrived", async () => {
    const captureId = randomUUID();
    const serialized = JSON.stringify({ sessionId: "chunk-session", assistant_response: "x".repeat(70_000) });
    const common = { sessionId: "chunk-session", capture_id: captureId, chunk_count: 2, original_event_kind: "conversation.turn.completed" };
    const first = await event("conversation.turn.chunk", { ...common, chunk_index: 0, text: serialized.slice(0, 35_000) });
    await expect(importer.importEvent(first)).rejects.toThrow("bridge_chunks_pending");
    const second = await event("conversation.turn.chunk", { ...common, chunk_index: 1, text: serialized.slice(35_000) });
    await importer.importEvent(second); await importer.importEvent(first);
    const conversation = await bridgeStorage(db).readConversation(companyId, "chunk-session");
    expect(conversation?.events).toHaveLength(2);
    expect(conversation?.conversation.agentId).toBe(agentId);
  });
});
