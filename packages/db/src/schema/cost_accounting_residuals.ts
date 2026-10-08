import { sql } from "drizzle-orm";
import { bigint, pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** Incremental USD-micro rounding carry, isolated by billing binding and UTC month. */
export const costAccountingResiduals = pgTable("cost_accounting_residuals", {
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  binding: text("binding").notNull(),
  accountingMonth: text("accounting_month").notNull(),
  residualMicros: bigint("residual_micros", { mode: "bigint" }).notNull().default(sql`0`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.companyId, table.binding, table.accountingMonth] }) }));
