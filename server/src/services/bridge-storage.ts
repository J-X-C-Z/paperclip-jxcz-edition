import { and, desc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  bridgeBindingRevisions,
  bridgeBindings,
  bridgeConversationIndex,
  bridgeEvents,
  bridgeReceipts,
  bridgeSnapshots,
  bridgeUsageProjection,
} from "@paperclipai/db";
import type { CreateBridgeBinding, CreateBridgeBindingRevision } from "@paperclipai/shared";

export function bridgeStorage(db: Db) {
  async function createBinding(companyId: string, input: CreateBridgeBinding) {
    return db.transaction(async (tx) => {
      const [binding] = await tx.insert(bridgeBindings).values({
        companyId,
        bindingKind: input.bindingKind,
        externalKey: input.externalKey,
      }).returning();
      const [revision] = await tx.insert(bridgeBindingRevisions).values({
        bindingId: binding.id,
        revision: 1,
        companyId,
        agentId: input.agentId ?? null,
        projectId: input.projectId ?? null,
        issueId: input.issueId ?? null,
        goalId: input.goalId ?? null,
        conversationId: input.conversationId ?? null,
      }).returning();
      return { ...binding, revision };
    });
  }

  async function createRevision(companyId: string, bindingId: string, input: CreateBridgeBindingRevision) {
    return db.transaction(async (tx) => {
      const [binding] = await tx.select().from(bridgeBindings).where(and(
        eq(bridgeBindings.companyId, companyId),
        eq(bridgeBindings.id, bindingId),
      )).for("update").limit(1);
      if (!binding) return null;
      const effectiveAt = new Date();
      const nextRevision = binding.currentRevision + 1;
      await tx.update(bridgeBindingRevisions).set({ validUntil: effectiveAt }).where(and(
        eq(bridgeBindingRevisions.bindingId, bindingId),
        eq(bridgeBindingRevisions.revision, binding.currentRevision),
        isNull(bridgeBindingRevisions.validUntil),
      ));
      const [revision] = await tx.insert(bridgeBindingRevisions).values({
        bindingId,
        revision: nextRevision,
        companyId,
        agentId: input.agentId ?? null,
        projectId: input.projectId ?? null,
        issueId: input.issueId ?? null,
        goalId: input.goalId ?? null,
        conversationId: input.conversationId ?? null,
        validFrom: effectiveAt,
      }).returning();
      const [updated] = await tx.update(bridgeBindings).set({
        currentRevision: nextRevision,
        updatedAt: effectiveAt,
      }).where(eq(bridgeBindings.id, bindingId)).returning();
      return { ...updated, revision };
    });
  }

  async function listBindings(companyId: string, options: { kind?: string; limit: number; cursor?: string }) {
    const filters = [eq(bridgeBindings.companyId, companyId)];
    if (options.kind) filters.push(eq(bridgeBindings.bindingKind, options.kind));
    if (options.cursor) filters.push(lt(bridgeBindings.id, options.cursor));
    const rows = await db.select().from(bridgeBindings).where(and(...filters))
      .orderBy(desc(bridgeBindings.id)).limit(options.limit + 1);
    return page(rows, options.limit);
  }

  async function listRevisions(companyId: string, bindingId: string) {
    return db.select().from(bridgeBindingRevisions).where(and(
      eq(bridgeBindingRevisions.companyId, companyId),
      eq(bridgeBindingRevisions.bindingId, bindingId),
    )).orderBy(desc(bridgeBindingRevisions.revision));
  }

  async function getBinding(companyId: string, bindingId: string) {
    const [row] = await db.select().from(bridgeBindings).where(and(
      eq(bridgeBindings.companyId, companyId),
      eq(bridgeBindings.id, bindingId),
    )).limit(1);
    return row ?? null;
  }

  async function readRevision(companyId: string, bindingId: string, revision: number) {
    const [row] = await db.select({ binding: bridgeBindings, revision: bridgeBindingRevisions })
      .from(bridgeBindings)
      .innerJoin(bridgeBindingRevisions, and(
        eq(bridgeBindingRevisions.bindingId, bridgeBindings.id),
        eq(bridgeBindingRevisions.revision, revision),
      ))
      .where(and(eq(bridgeBindings.companyId, companyId), eq(bridgeBindings.id, bindingId))).limit(1);
    return row ?? null;
  }

  async function publishSnapshot(input: {
    companyId: string;
    bindingId: string;
    bindingRevision: number;
    snapshotKey: string;
    payload: Record<string, unknown>;
    tombstone?: boolean;
  }) {
    const payloadText = JSON.stringify(input.tombstone ? {} : input.payload);
    return db.transaction(async (tx) => {
      const [canonical] = await tx.execute<{ payloadBytes: number }>(sql`select octet_length(${payloadText}::jsonb::text) as "payloadBytes"`);
      const payloadBytes = canonical!.payloadBytes;
      if (payloadBytes > 65_536) throw new Error("bridge_snapshot_too_large");
      const [binding] = await tx.select().from(bridgeBindings).where(and(
        eq(bridgeBindings.companyId, input.companyId),
        eq(bridgeBindings.id, input.bindingId),
      )).for("update").limit(1);
      if (!binding) throw new Error("bridge_binding_not_found");
      const [revision] = await tx.select().from(bridgeBindingRevisions).where(and(
        eq(bridgeBindingRevisions.companyId, input.companyId),
        eq(bridgeBindingRevisions.bindingId, input.bindingId),
        eq(bridgeBindingRevisions.revision, input.bindingRevision),
        lte(bridgeBindingRevisions.validFrom, new Date()),
        or(isNull(bridgeBindingRevisions.validUntil), gt(bridgeBindingRevisions.validUntil, new Date())),
      )).limit(1);
      if (!revision) throw new Error("bridge_binding_revision_not_effective");
      const [latest] = await tx.select({ version: bridgeSnapshots.version }).from(bridgeSnapshots).where(and(
        eq(bridgeSnapshots.bindingId, input.bindingId),
        eq(bridgeSnapshots.snapshotKey, input.snapshotKey),
      )).orderBy(desc(bridgeSnapshots.version)).limit(1);
      const [snapshot] = await tx.insert(bridgeSnapshots).values({
        companyId: input.companyId,
        bindingId: input.bindingId,
        bindingRevision: input.bindingRevision,
        snapshotKey: input.snapshotKey,
        version: (latest?.version ?? 0) + 1,
        tombstone: input.tombstone ?? false,
        payload: input.tombstone ? {} : input.payload,
        payloadBytes,
      }).returning();
      return snapshot;
    });
  }

  async function listSnapshots(companyId: string, options: { bindingId?: string; key?: string; limit: number; cursor?: string }) {
    const filters = [eq(bridgeSnapshots.companyId, companyId)];
    if (options.bindingId) filters.push(eq(bridgeSnapshots.bindingId, options.bindingId));
    if (options.key) filters.push(eq(bridgeSnapshots.snapshotKey, options.key));
    if (options.cursor) filters.push(lt(bridgeSnapshots.id, options.cursor));
    const rows = await db.select().from(bridgeSnapshots).where(and(...filters))
      .orderBy(desc(bridgeSnapshots.id)).limit(options.limit + 1);
    return page(rows, options.limit);
  }

  async function listEvents(companyId: string, options: { bindingId?: string; eventKind?: string; from?: Date; to?: Date; limit: number; cursor?: string }) {
    const filters = [eq(bridgeEvents.companyId, companyId)];
    if (options.bindingId) filters.push(eq(bridgeEvents.bindingId, options.bindingId));
    if (options.eventKind) filters.push(eq(bridgeEvents.eventKind, options.eventKind));
    if (options.from) filters.push(gte(bridgeEvents.receivedAt, options.from));
    if (options.to) filters.push(lte(bridgeEvents.receivedAt, options.to));
    if (options.cursor) filters.push(lt(bridgeEvents.id, options.cursor));
    const rows = await db.select({
      id: bridgeEvents.id,
      companyId: bridgeEvents.companyId,
      bindingId: bridgeEvents.bindingId,
      bindingRevision: bridgeEvents.bindingRevision,
      protocolVersion: bridgeEvents.protocolVersion,
      payloadVersion: bridgeEvents.payloadVersion,
      eventKind: bridgeEvents.eventKind,
      sourceKind: bridgeEvents.sourceKind,
      sourceKey: bridgeEvents.sourceKey,
      payloadSha256: bridgeEvents.payloadSha256,
      occurredAt: bridgeEvents.occurredAt,
      receivedAt: bridgeEvents.receivedAt,
    }).from(bridgeEvents).where(and(...filters)).orderBy(desc(bridgeEvents.id)).limit(options.limit + 1);
    return page(rows, options.limit);
  }

  async function listReceipts(companyId: string, eventId: string) {
    return db.select({
      id: bridgeReceipts.id,
      eventId: bridgeReceipts.eventId,
      consumer: bridgeReceipts.consumer,
      state: bridgeReceipts.state,
      attempt: bridgeReceipts.attempt,
      retryAt: bridgeReceipts.retryAt,
      lastError: bridgeReceipts.lastError,
    }).from(bridgeReceipts).innerJoin(bridgeEvents, eq(bridgeEvents.id, bridgeReceipts.eventId))
      .where(and(eq(bridgeEvents.companyId, companyId), eq(bridgeEvents.id, eventId)));
  }

  async function listConversations(companyId: string, options: { agentId?: string; projectId?: string; issueId?: string; from?: Date; to?: Date; limit: number; cursor?: string }) {
    const filters = [eq(bridgeConversationIndex.companyId, companyId)];
    if (options.agentId) filters.push(eq(bridgeConversationIndex.agentId, options.agentId));
    if (options.projectId) filters.push(eq(bridgeConversationIndex.projectId, options.projectId));
    if (options.issueId) filters.push(eq(bridgeConversationIndex.issueId, options.issueId));
    if (options.from) filters.push(gte(bridgeConversationIndex.updatedAt, options.from));
    if (options.to) filters.push(lte(bridgeConversationIndex.updatedAt, options.to));
    if (options.cursor) filters.push(lt(bridgeConversationIndex.id, options.cursor));
    const rows = await db.select({
      id: bridgeConversationIndex.id,
      conversationId: bridgeConversationIndex.conversationId,
      agentId: bridgeConversationIndex.agentId,
      projectId: bridgeConversationIndex.projectId,
      issueId: bridgeConversationIndex.issueId,
      startedAt: bridgeConversationIndex.startedAt,
      updatedAt: bridgeConversationIndex.updatedAt,
    }).from(bridgeConversationIndex).where(and(...filters)).orderBy(desc(bridgeConversationIndex.id)).limit(options.limit + 1);
    return page(rows, options.limit);
  }

  async function readConversation(companyId: string, conversationId: string) {
    const [conversation] = await db.select().from(bridgeConversationIndex).where(and(
      eq(bridgeConversationIndex.companyId, companyId), eq(bridgeConversationIndex.conversationId, conversationId),
    )).limit(1);
    if (!conversation) return null;
    const events = await db.select({ id: bridgeEvents.id, eventKind: bridgeEvents.eventKind,
      sourceKey: bridgeEvents.sourceKey, payload: bridgeEvents.payload, occurredAt: bridgeEvents.occurredAt })
      .from(bridgeEvents).where(and(eq(bridgeEvents.companyId, companyId), eq(bridgeEvents.bindingId, conversation.bindingId),
        sql`coalesce(${bridgeEvents.payload}->>'sessionId', ${bridgeEvents.payload}->>'session_id', ${bridgeEvents.payload}->>'task_id') = ${conversationId}`))
      .orderBy(bridgeEvents.occurredAt, bridgeEvents.receivedAt);
    const usage = await db.select().from(bridgeUsageProjection).where(and(eq(bridgeUsageProjection.companyId, companyId),
      eq(bridgeUsageProjection.bindingId, conversation.bindingId), eq(bridgeUsageProjection.sessionKey, conversationId))).orderBy(bridgeUsageProjection.occurredAt);
    return { conversation, events, usage };
  }

  async function listUsage(companyId: string, options: { agentId?: string; projectId?: string; issueId?: string; from?: Date; to?: Date; granularity?: "request" | "session"; limit: number; cursor?: string }) {
    const filters = [eq(bridgeUsageProjection.companyId, companyId)];
    if (options.agentId) filters.push(eq(bridgeUsageProjection.accountingOwnerAgentId, options.agentId));
    if (options.projectId) filters.push(sql`${bridgeUsageProjection.bindingId} in (select binding_id from paperclip_bridge_v1.binding_revisions where project_id = ${options.projectId})`);
    if (options.issueId) filters.push(sql`${bridgeUsageProjection.bindingId} in (select binding_id from paperclip_bridge_v1.binding_revisions where issue_id = ${options.issueId})`);
    if (options.from) filters.push(gte(bridgeUsageProjection.occurredAt, options.from));
    if (options.to) filters.push(lte(bridgeUsageProjection.occurredAt, options.to));
    if (options.granularity) filters.push(eq(bridgeUsageProjection.granularity, options.granularity));
    if (options.cursor) filters.push(lt(bridgeUsageProjection.id, options.cursor));
    const rows = await db.select().from(bridgeUsageProjection).where(and(...filters))
      .orderBy(desc(bridgeUsageProjection.id)).limit(options.limit + 1);
    return page(rows, options.limit);
  }

  /** Idempotent importer primitive. Same natural key with changed content is a hard conflict. */
  async function appendEvent(input: typeof bridgeEvents.$inferInsert) {
    const payloadText = JSON.stringify(input.payload);
    if (input.protocolVersion !== 1 || input.payloadVersion < 1) throw new Error("bridge_protocol_version_unsupported");
    return db.transaction(async (tx) => {
      const canonical = await tx.execute<{ payloadBytes: number; payloadSha256: string }>(sql`
        select octet_length(${payloadText}::jsonb::text) as "payloadBytes",
          encode(public.digest(convert_to(${payloadText}::jsonb::text, 'UTF8'), 'sha256'), 'hex') as "payloadSha256"
      `);
      const { payloadBytes, payloadSha256 } = canonical[0]!;
      if (payloadBytes > 65_536) throw new Error("bridge_event_too_large");
      const occurredAt = input.occurredAt;
      const [revision] = await tx.select().from(bridgeBindingRevisions).where(and(
        eq(bridgeBindingRevisions.companyId, input.companyId),
        eq(bridgeBindingRevisions.bindingId, input.bindingId),
        eq(bridgeBindingRevisions.revision, input.bindingRevision),
        lte(bridgeBindingRevisions.validFrom, occurredAt),
        or(isNull(bridgeBindingRevisions.validUntil), gt(bridgeBindingRevisions.validUntil, occurredAt)),
      )).limit(1);
      if (!revision) throw new Error("bridge_binding_revision_not_effective_at_event_time");
      const [inserted] = await tx.insert(bridgeEvents).values({ ...input, payloadBytes, payloadSha256 }).onConflictDoNothing({
        target: [bridgeEvents.bindingId, bridgeEvents.sourceKind, bridgeEvents.sourceKey],
      }).returning();
      if (inserted) return { event: inserted, replayed: false };
      const [existing] = await tx.select().from(bridgeEvents).where(and(
        eq(bridgeEvents.bindingId, input.bindingId),
        eq(bridgeEvents.sourceKind, input.sourceKind),
        eq(bridgeEvents.sourceKey, input.sourceKey),
      )).limit(1);
      if (existing) {
        if (existing.payloadSha256 !== payloadSha256) throw new Error("bridge_event_hash_conflict");
        return { event: existing, replayed: true };
      }
      const [event] = await tx.insert(bridgeEvents).values({ ...input, payloadBytes, payloadSha256 }).returning();
      return { event, replayed: false };
    });
  }

  async function projectUsage(input: Omit<typeof bridgeUsageProjection.$inferInsert, "accountingOwnerAgentId" | "accountingStatus">) {
    if (!/^[0-9]+$/.test(input.amountMicroUsd)) throw new Error("bridge_usage_amount_must_be_integer_micro_usd");
    return db.transaction(async (tx) => {
      const [binding] = await tx.select({ id: bridgeBindings.id }).from(bridgeBindings).where(and(
        eq(bridgeBindings.id, input.bindingId),
        eq(bridgeBindings.companyId, input.companyId),
      )).for("update").limit(1);
      if (!binding) throw new Error("bridge_binding_not_found");
      // Serialize aggregates across bindings too: sessions can span more than one
      // binding, and the request/session exclusion must not depend on one row lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.companyId}:${input.sessionKey}`}, 0))`);
      const [revision] = await tx.select().from(bridgeBindingRevisions).where(and(
        eq(bridgeBindingRevisions.companyId, input.companyId),
        eq(bridgeBindingRevisions.bindingId, input.bindingId),
        eq(bridgeBindingRevisions.revision, input.bindingRevision),
        lte(bridgeBindingRevisions.validFrom, input.occurredAt),
        or(isNull(bridgeBindingRevisions.validUntil), gt(bridgeBindingRevisions.validUntil, input.occurredAt)),
      )).limit(1);
      if (!revision) throw new Error("bridge_binding_revision_not_effective_at_usage_time");
      const [conflicting] = await tx.select({ id: bridgeUsageProjection.id }).from(bridgeUsageProjection).where(and(
        eq(bridgeUsageProjection.companyId, input.companyId),
        eq(bridgeUsageProjection.sessionKey, input.sessionKey),
        sql`${bridgeUsageProjection.granularity} <> ${input.granularity}`,
      )).limit(1);
      if (conflicting) throw new Error("bridge_usage_request_session_aggregate_conflict");
      const [projection] = await tx.insert(bridgeUsageProjection).values({
        ...input,
        accountingOwnerAgentId: revision.accountingOwnerAgentId,
        accountingStatus: revision.accountingOwnerAgentId ? "attributed" : "reconciliation_required",
      }).returning();
      return projection;
    });
  }

  /** Trusted scheduler-only registration; deliberately absent from HTTP and Hermes APIs. */
  async function registerAccountingOwner(companyId: string, bindingId: string, ownerAgentId: string) {
    return db.transaction(async (tx) => {
      const [binding] = await tx.select().from(bridgeBindings).where(and(
        eq(bridgeBindings.id, bindingId),
        eq(bridgeBindings.companyId, companyId),
      )).for("update").limit(1);
      if (!binding) throw new Error("bridge_binding_not_found");
      const [agent] = await tx.select({ id: agents.id }).from(agents).where(and(
        eq(agents.id, ownerAgentId),
        eq(agents.companyId, companyId),
      )).limit(1);
      if (!agent) throw new Error("bridge_accounting_owner_not_in_company");
      const [current] = await tx.select().from(bridgeBindingRevisions).where(and(
        eq(bridgeBindingRevisions.bindingId, bindingId),
        eq(bridgeBindingRevisions.revision, binding.currentRevision),
        eq(bridgeBindingRevisions.companyId, companyId),
      )).limit(1);
      if (!current) throw new Error("bridge_binding_revision_not_found");
      if (current.accountingOwnerAgentId === ownerAgentId) return current;
      const now = new Date();
      await tx.update(bridgeBindingRevisions).set({ validUntil: now }).where(and(
        eq(bridgeBindingRevisions.bindingId, bindingId),
        eq(bridgeBindingRevisions.revision, current.revision),
        isNull(bridgeBindingRevisions.validUntil),
      ));
      const [revision] = await tx.insert(bridgeBindingRevisions).values({
        bindingId,
        revision: current.revision + 1,
        companyId,
        agentId: current.agentId,
        projectId: current.projectId,
        issueId: current.issueId,
        goalId: current.goalId,
        conversationId: current.conversationId,
        accountingOwnerAgentId: ownerAgentId,
        validFrom: now,
      }).returning();
      await tx.update(bridgeBindings).set({ currentRevision: revision.revision, updatedAt: now }).where(eq(bridgeBindings.id, bindingId));
      return revision;
    });
  }

  return { createBinding, createRevision, getBinding, listBindings, listRevisions, readRevision, publishSnapshot, listSnapshots, listEvents, listReceipts, listConversations, readConversation, listUsage, appendEvent, projectUsage, registerAccountingOwner };
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}
