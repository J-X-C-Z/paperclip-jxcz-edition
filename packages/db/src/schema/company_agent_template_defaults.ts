import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const companyAgentTemplateDefaults = pgTable("company_agent_template_defaults", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  systemPrompt: text("system_prompt"),
  skills: jsonb("skills").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ companyTemplateUnique: uniqueIndex("company_agent_template_defaults_company_template_idx").on(table.companyId, table.templateId) }));
