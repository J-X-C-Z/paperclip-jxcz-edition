import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";

export const briefs = pgTable("briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
  authorAgentName: text("author_agent_name").notNull().default(""),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sourceRefs: jsonb("source_refs").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ issueUq: uniqueIndex("briefs_issue_uq").on(table.issueId), companyCreatedIdx: index("briefs_company_created_idx").on(table.companyId, table.createdAt),
  companyProjectIdx: index("briefs_company_project_idx").on(table.companyId, table.projectId) }));

export const briefSettings = pgTable("brief_settings", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  secretaryAgentId: uuid("secretary_agent_id").references(() => agents.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
