import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { bridgeBindingRevisions, bridgeConversationIndex, bridgeEvents, bridgeReceipts, bridgeUsageProjection } from "@paperclipai/db";
import { unitsToCents } from "@paperclipai/shared";
import { createCostEventInTransaction } from "./costs.js";
import { withAccountingTransaction } from "./accounting-transaction.js";

const CONSUMER = "paperclip";
type Event = typeof bridgeEvents.$inferSelect;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.length > 0 ? value : undefined;
const integer = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 2_147_483_647 ? Number(value) : 0;

/** Bounded, transactionally idempotent data import. Conversation events never
 * invoke heartbeat, comments, or bot activity. Only verified billed cost emits
 * the ordinary system accounting activity after transaction commit. */
export function bridgeImporter(db: Db) {
  async function importEvent(event: Event) {
    const result = await withAccountingTransaction(db, event.companyId, async (tx, publications) => {
      await tx.insert(bridgeReceipts).values({ companyId: event.companyId, eventId: event.id, consumer: CONSUMER }).onConflictDoNothing();
      const [receipt] = await tx.select().from(bridgeReceipts).where(and(eq(bridgeReceipts.eventId, event.id), eq(bridgeReceipts.consumer, CONSUMER))).for("update").limit(1);
      if (!receipt || receipt.state === "completed" || receipt.state === "quarantined") return false;
      const [revision] = await tx.select().from(bridgeBindingRevisions).where(and(eq(bridgeBindingRevisions.bindingId, event.bindingId), eq(bridgeBindingRevisions.revision, event.bindingRevision), eq(bridgeBindingRevisions.companyId, event.companyId))).limit(1);
      if (!revision) throw new Error("bridge_revision_missing");
      let payload = record(event.payload);
      let kind = event.eventKind;
      if (kind === "conversation.turn.chunk") {
        const captureId = text(payload.capture_id);
        const count = integer(payload.chunk_count);
        if (!captureId || count < 1 || count > 10_000) throw new Error("bridge_invalid_chunk");
        const pieces = await tx.select().from(bridgeEvents).where(and(eq(bridgeEvents.companyId, event.companyId), eq(bridgeEvents.bindingId, event.bindingId), eq(bridgeEvents.bindingRevision, event.bindingRevision), eq(bridgeEvents.eventKind, kind), sql`${bridgeEvents.payload}->>'capture_id' = ${captureId}`));
        const indexed = new Map(pieces.map(piece => [integer(record(piece.payload).chunk_index), record(piece.payload)]));
        if (indexed.size !== count || Array.from({ length: count }, (_, i) => i).some(i => !indexed.has(i))) throw new Error("bridge_chunks_pending");
        // Each chunk remains an independently visible event; only the final
        // chunk performs the derived projection after all pieces arrive.
        if (integer(payload.chunk_index) !== count - 1) {
          await tx.update(bridgeReceipts).set({ state: "completed", completedAt: new Date(), attempt: sql`${bridgeReceipts.attempt} + 1`, lastError: null }).where(eq(bridgeReceipts.id, receipt.id));
          return true;
        }
        kind = text(payload.original_event_kind) ?? "";
        payload = record(JSON.parse(Array.from({ length: count }, (_, i) => String(indexed.get(i)!.text ?? "")).join("")));
      }
      const sessionKey = text(payload.sessionId) ?? text(payload.session_id) ?? text(payload.task_id);
      if (sessionKey) {
        await tx.insert(bridgeConversationIndex).values({ companyId: event.companyId, bindingId: event.bindingId, bindingRevision: event.bindingRevision,
          conversationId: sessionKey, agentId: revision.agentId, projectId: revision.projectId, issueId: revision.issueId,
          startedAt: event.occurredAt, updatedAt: event.occurredAt, metadata: { sourceKind: event.sourceKind } })
          .onConflictDoUpdate({ target: [bridgeConversationIndex.companyId, bridgeConversationIndex.conversationId], set: {
            updatedAt: sql`greatest(${bridgeConversationIndex.updatedAt}, ${event.occurredAt.toISOString()}::timestamptz)`, startedAt: sql`least(${bridgeConversationIndex.startedAt}, ${event.occurredAt.toISOString()}::timestamptz)`,
          } });
      }
      if ((kind === "model.request.completed" || kind === "model.auxiliary_request.completed") && sessionKey) {
        // Hermes cost estimates or session totals are never promoted to billed
        // provider spend. Explicit receipt fields are required for accounting.
        const usage = record(payload.usage ?? payload.token_usage);
        const cost = record(payload.cost ?? payload.billing);
        const amount = text(cost.billedAmountMicroUsd ?? cost.billed_amount_micro_usd);
        const verifiedBilled = (cost.currency === "USD") && (cost.billingStatus ?? cost.billing_status) === "billed"
          && (cost.pricingStatus ?? cost.pricing_status) === "priced" && amount !== undefined && /^(0|[1-9][0-9]*)$/.test(amount);
        const owner = revision.accountingOwnerAgentId;
        const provider = text(payload.provider ?? cost.provider) ?? "hermes";
        const model = text(payload.model ?? payload.model_name) ?? "unknown";
        const inputTokens = integer(usage.input_tokens ?? usage.prompt_tokens ?? usage.input);
        const outputTokens = integer(usage.output_tokens ?? usage.completion_tokens ?? usage.output);
        const [projection] = await tx.insert(bridgeUsageProjection).values({ id: event.id, companyId: event.companyId, bindingId: event.bindingId,
          bindingRevision: event.bindingRevision, sourceKind: event.sourceKind, sourceKey: event.sourceKey, granularity: "request", sessionKey,
          accountingOwnerAgentId: owner, accountingStatus: owner ? "attributed" : "reconciliation_required",
          pricingStatus: verifiedBilled ? "priced" : (cost.pricingStatus ?? cost.pricing_status) === "estimated" ? "estimated" : "unpriced",
          billingStatus: verifiedBilled ? "billed" : (cost.billingStatus ?? cost.billing_status) === "included" ? "included" : "unknown",
          amountMicroUsd: verifiedBilled ? amount! : "0", inputTokens, outputTokens, occurredAt: event.occurredAt })
          .onConflictDoNothing({ target: [bridgeUsageProjection.bindingId, bridgeUsageProjection.sourceKind, bridgeUsageProjection.sourceKey] }).returning();
        if (projection && verifiedBilled && owner) {
          await createCostEventInTransaction(tx, event.companyId, { id: event.id, agentId: owner, projectId: revision.projectId, issueId: revision.issueId,
            goalId: revision.goalId, provider, model, biller: provider, billingType: "metered_api", costCents: unitsToCents(BigInt(amount!) * 1000n),
            billedUsdMicros: BigInt(amount!), costPrecisionSource: "bridge_micro_usd", idempotencyKey: `bridge:${event.id}`,
            inputTokens, outputTokens, occurredAt: event.occurredAt }, publications,
            { actorType: "system", actorId: "bridge_importer", agentId: null });
        }
      }
      await tx.update(bridgeReceipts).set({ state: "completed", attempt: sql`${bridgeReceipts.attempt} + 1`, completedAt: new Date(), lastError: null, retryAt: null, updatedAt: new Date() }).where(eq(bridgeReceipts.id, receipt.id));
      return true;
    });
    return result;
  }

  async function sweepPending(limit = 100) {
    const events = await db.select().from(bridgeEvents).where(sql`not exists (select 1 from paperclip_bridge_v1.receipts r where r.event_id = ${bridgeEvents.id} and r.consumer = ${CONSUMER} and (r.state in ('completed','quarantined') or r.retry_at > now()))`).orderBy(asc(bridgeEvents.receivedAt)).limit(Math.min(Math.max(limit, 1), 500));
    let completed = 0;
    for (const event of events) {
      try { if (await importEvent(event)) completed += 1; }
      catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
        const pending = message === "bridge_chunks_pending";
        await db.insert(bridgeReceipts).values({ companyId: event.companyId, eventId: event.id, consumer: CONSUMER, state: "retry", attempt: pending ? 0 : 1, lastError: message, retryAt: new Date(Date.now() + 10_000) })
          .onConflictDoUpdate({ target: [bridgeReceipts.eventId, bridgeReceipts.consumer], set: {
            state: pending ? "retry" : sql`case when ${bridgeReceipts.attempt} >= 19 then 'quarantined' else 'retry' end`,
            attempt: pending ? sql`${bridgeReceipts.attempt}` : sql`${bridgeReceipts.attempt} + 1`, lastError: message,
            retryAt: new Date(Date.now() + 10_000), updatedAt: new Date(),
          }, where: sql`${bridgeReceipts.state} not in ('completed','quarantined')` });
      }
    }
    return { scanned: events.length, completed };
  }
  return { importEvent, sweepPending };
}
