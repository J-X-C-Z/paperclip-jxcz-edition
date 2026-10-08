import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Hermes data is deliberately isolated from Paperclip's application tables. */
export const bridgeSchema = pgSchema("paperclip_bridge_v1");

export const bridgeBindings = bridgeSchema.table(
  "bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    bindingKind: text("binding_kind").notNull(),
    externalKey: text("external_key").notNull(),
    currentRevision: integer("current_revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyExternalKeyUq: uniqueIndex("bridge_bindings_company_external_key_uq").on(
      table.companyId,
      table.bindingKind,
      table.externalKey,
    ),
    companyIdx: index("bridge_bindings_company_idx").on(table.companyId, table.id),
    kindCheck: check("bridge_bindings_kind_check", sql`${table.bindingKind} in ('agent','project','issue','goal','conversation','accounting_owner')`),
  }),
);

/** Revisions are immutable; only valid_until may be set once by rotation. */
export const bridgeBindingRevisions = bridgeSchema.table(
  "binding_revisions",
  {
    bindingId: uuid("binding_id").notNull().references(() => bridgeBindings.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    companyId: uuid("company_id").notNull(),
    agentId: uuid("agent_id"),
    projectId: uuid("project_id"),
    issueId: uuid("issue_id"),
    goalId: uuid("goal_id"),
    conversationId: text("conversation_id"),
    accountingOwnerAgentId: uuid("accounting_owner_agent_id"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bindingId, table.revision], name: "bridge_binding_revisions_pk" }),
    companyIdx: index("bridge_binding_revisions_company_idx").on(table.companyId, table.bindingId, table.revision),
    revisionCheck: check("bridge_binding_revisions_revision_check", sql`${table.revision} > 0`),
    intervalCheck: check("bridge_binding_revisions_interval_check", sql`${table.validUntil} is null or ${table.validUntil} > ${table.validFrom}`),
  }),
);

/** Explicit database-role to binding capability map checked inside SECURITY DEFINER functions. */
export const bridgeBindingDatabaseRoles = bridgeSchema.table(
  "binding_database_roles",
  {
    databaseRole: text("database_role").notNull(),
    bindingId: uuid("binding_id").notNull().references(() => bridgeBindings.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull(),
    canAppend: boolean("can_append").notNull().default(true),
    canReadSnapshots: boolean("can_read_snapshots").notNull().default(true),
    canReadReceipts: boolean("can_read_receipts").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roleBindingUq: uniqueIndex("bridge_binding_database_roles_role_binding_uq").on(table.databaseRole, table.bindingId),
    roleIdx: index("bridge_binding_database_roles_role_idx").on(table.databaseRole, table.companyId),
  }),
);

export const bridgeSnapshots = bridgeSchema.table(
  "snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    bindingId: uuid("binding_id").notNull().references(() => bridgeBindings.id, { onDelete: "cascade" }),
    bindingRevision: integer("binding_revision").notNull(),
    snapshotKey: text("snapshot_key").notNull(),
    version: bigint("version", { mode: "number" }).notNull(),
    tombstone: boolean("tombstone").notNull().default(false),
    payload: jsonb("payload").notNull().default({}),
    payloadBytes: integer("payload_bytes").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyVersionUq: uniqueIndex("bridge_snapshots_binding_key_version_uq").on(table.bindingId, table.snapshotKey, table.version),
    companyPublishedIdx: index("bridge_snapshots_company_published_idx").on(table.companyId, table.publishedAt),
    versionCheck: check("bridge_snapshots_version_check", sql`${table.version} > 0`),
    sizeCheck: check("bridge_snapshots_size_check", sql`${table.payloadBytes} between 0 and 65536`),
    tombstoneCheck: check("bridge_snapshots_tombstone_payload_check", sql`not ${table.tombstone} or ${table.payload} = '{}'::jsonb`),
  }),
);

export const bridgeEvents = bridgeSchema.table(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    bindingId: uuid("binding_id").notNull().references(() => bridgeBindings.id, { onDelete: "cascade" }),
    bindingRevision: integer("binding_revision").notNull(),
    protocolVersion: integer("protocol_version").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    eventKind: text("event_kind").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceKey: text("source_key").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKeyUq: uniqueIndex("bridge_events_source_natural_key_uq").on(table.bindingId, table.sourceKind, table.sourceKey),
    companyReceivedIdx: index("bridge_events_company_received_idx").on(table.companyId, table.receivedAt),
    bindingRevisionIdx: index("bridge_events_binding_revision_idx").on(table.bindingId, table.bindingRevision),
    protocolCheck: check("bridge_events_protocol_check", sql`${table.protocolVersion} = 1 and ${table.payloadVersion} > 0`),
    hashCheck: check("bridge_events_hash_check", sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
    sizeCheck: check("bridge_events_size_check", sql`${table.payloadBytes} between 0 and 65536`),
  }),
);

export const bridgeReceipts = bridgeSchema.table(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    eventId: uuid("event_id").notNull().references(() => bridgeEvents.id, { onDelete: "cascade" }),
    consumer: text("consumer").notNull(),
    state: text("state").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    retryAt: timestamp("retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventConsumerUq: uniqueIndex("bridge_receipts_event_consumer_uq").on(table.eventId, table.consumer),
    companyStateRetryIdx: index("bridge_receipts_company_state_retry_idx").on(table.companyId, table.state, table.retryAt),
    stateCheck: check("bridge_receipts_state_check", sql`${table.state} in ('pending','leased','completed','retry','quarantined')`),
    attemptCheck: check("bridge_receipts_attempt_check", sql`${table.attempt} >= 0`),
  }),
);

export const bridgeConversationIndex = bridgeSchema.table(
  "conversation_index",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    bindingId: uuid("binding_id").notNull().references(() => bridgeBindings.id, { onDelete: "cascade" }),
    bindingRevision: integer("binding_revision").notNull(),
    conversationId: text("conversation_id").notNull(),
    agentId: uuid("agent_id"),
    projectId: uuid("project_id"),
    issueId: uuid("issue_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => ({
    companyConversationUq: uniqueIndex("bridge_conversation_index_company_conversation_uq").on(table.companyId, table.conversationId),
    companyUpdatedIdx: index("bridge_conversation_index_company_updated_idx").on(table.companyId, table.updatedAt),
    refsIdx: index("bridge_conversation_index_company_refs_idx").on(table.companyId, table.agentId, table.projectId, table.issueId),
  }),
);

export const bridgeUsageProjection = bridgeSchema.table(
  "usage_projection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    bindingId: uuid("binding_id").notNull().references(() => bridgeBindings.id, { onDelete: "cascade" }),
    bindingRevision: integer("binding_revision").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceKey: text("source_key").notNull(),
    granularity: text("granularity").notNull(),
    sessionKey: text("session_key").notNull(),
    accountingOwnerAgentId: uuid("accounting_owner_agent_id"),
    accountingStatus: text("accounting_status").notNull(),
    pricingStatus: text("pricing_status").notNull(),
    billingStatus: text("billing_status").notNull(),
    amountMicroUsd: text("amount_micro_usd").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceUq: uniqueIndex("bridge_usage_projection_source_uq").on(table.bindingId, table.sourceKind, table.sourceKey),
    companyOccurredIdx: index("bridge_usage_projection_company_occurred_idx").on(table.companyId, table.occurredAt),
    sessionIdx: index("bridge_usage_projection_session_idx").on(table.companyId, table.sessionKey, table.granularity),
    granularityCheck: check("bridge_usage_projection_granularity_check", sql`${table.granularity} in ('request','session')`),
    amountCheck: check("bridge_usage_projection_amount_check", sql`${table.amountMicroUsd} ~ '^[0-9]+$'`),
    pricingCheck: check("bridge_usage_projection_pricing_check", sql`${table.pricingStatus} in ('priced','unpriced','estimated')`),
    billingCheck: check("bridge_usage_projection_billing_check", sql`${table.billingStatus} in ('billed','included','unknown','not_billable')`),
    accountingCheck: check("bridge_usage_projection_accounting_check", sql`(${table.accountingOwnerAgentId} is null and ${table.accountingStatus} = 'reconciliation_required') or (${table.accountingOwnerAgentId} is not null and ${table.accountingStatus} = 'attributed')`),
  }),
);
