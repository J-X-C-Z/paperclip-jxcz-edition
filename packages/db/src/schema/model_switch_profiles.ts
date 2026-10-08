import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import type { ModelSwitchProfileData } from "@paperclipai/shared";
import { companies } from "./companies.js";

/** Saved model-switch presets ("配置文件"): per-title adapter/model assignments
 * applied as a one-click switch from the Apps → Models surface. Built-in presets
 * (all Codex + GPT, all MiMo Code + V2.6) are computed in code, not stored here. */
export const modelSwitchProfiles = pgTable(
  "model_switch_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    profile: jsonb("profile").$type<ModelSwitchProfileData>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyNameIdx: uniqueIndex("model_switch_profiles_company_name_uq").on(
      table.companyId,
      table.name,
    ),
  }),
);
