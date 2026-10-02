import { pgTable, uuid, text, boolean, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { agents } from "./agents.js";

// Team participation is independent of company reporting and user sidebar preferences.
export const projectAgentMemberships = pgTable("project_agent_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  projectRole: text("project_role"),
  isLead: boolean("is_lead").notNull().default(false),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectAgentUq: uniqueIndex("project_agent_memberships_project_agent_uq").on(table.projectId, table.agentId),
  companyProjectIdx: index("project_agent_memberships_company_project_idx").on(table.companyId, table.projectId),
  companyAgentIdx: index("project_agent_memberships_company_agent_idx").on(table.companyId, table.agentId),
}));
