import { index, integer, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** Post-commit, retryable budget cancellation side effects. */
export const costAccountingOutbox = pgTable("cost_accounting_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull(),
  scopeId: uuid("scope_id").notNull(),
  policyId: uuid("policy_id").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => ({
  dedupe: uniqueIndex("cost_accounting_outbox_dedupe_idx").on(table.companyId, table.scopeType, table.scopeId, table.policyId, table.windowStart),
  pending: index("cost_accounting_outbox_pending_idx").on(table.status, table.createdAt),
}));
