import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { modelSwitchProfiles } from "@paperclipai/db";
import type { ModelSwitchProfile, ModelSwitchProfileData } from "@paperclipai/shared";

/** Titles that plan/lead get the stronger tier in the built-in presets, matching
 * the operator's standing rule: 组长/部长/经理 → pro tier, everyone else → lite. */
const LEADERSHIP_TITLES = ["组长", "部长", "经理"] as const;

/** Resolve the MiMo Code executable the way the mimocode_local adapter needs it:
 * PATH first, then the CLI's default install location. Returns undefined when
 * neither exists so callers fall back to the adapter default ("mimo"). */
export function resolveMimocodeCommand(): string | undefined {
  const name = "mimo";
  const candidates = [
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, name)),
    path.join(os.homedir(), ".mimocode", "bin", name),
  ];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

/** Built-in one-click presets ("配置文件"), computed per instance so the MiMo
 * Code command resolves to this machine's install. Not stored in the database. */
export function builtInModelSwitchProfiles(): ModelSwitchProfile[] {
  const codex = (model: string) => ({ adapterType: "codex_local", model });
  const mimocode = (model: string) => {
    const command = resolveMimocodeCommand();
    return command
      ? { adapterType: "mimocode_local", model, adapterConfig: { command } }
      : { adapterType: "mimocode_local", model };
  };
  const leadership = (make: (model: string) => ModelSwitchProfile["default"], model: string) =>
    Object.fromEntries(LEADERSHIP_TITLES.map((title) => [title, make(model)]));
  return [
    {
      name: "全部 Codex · GPT-6",
      default: codex("gpt-6-luna"),
      titles: leadership(codex, "gpt-6.1-sol"),
    },
    {
      name: "全部 MiMo Code · V2.6",
      default: mimocode("mimo/mimo-v2.6-flash"),
      titles: leadership(mimocode, "mimo/mimo-v2.6-pro"),
    },
  ];
}

export function modelSwitchProfileService(db: Db) {
  return {
    builtIns: builtInModelSwitchProfiles,

    async list(companyId: string): Promise<Array<{ id: string; name: string; profile: ModelSwitchProfileData; updatedAt: Date }>> {
      const rows = await db
        .select()
        .from(modelSwitchProfiles)
        .where(eq(modelSwitchProfiles.companyId, companyId))
        .orderBy(modelSwitchProfiles.name);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        profile: row.profile,
        updatedAt: row.updatedAt,
      }));
    },

    /** Save a profile, replacing an existing one with the same name. */
    async save(companyId: string, name: string, profile: ModelSwitchProfileData) {
      const [row] = await db
        .insert(modelSwitchProfiles)
        .values({ companyId, name, profile })
        .onConflictDoUpdate({
          target: [modelSwitchProfiles.companyId, modelSwitchProfiles.name],
          set: { profile, updatedAt: new Date() },
        })
        .returning();
      return row ?? null;
    },

    async remove(companyId: string, id: string): Promise<boolean> {
      const deleted = await db
        .delete(modelSwitchProfiles)
        .where(and(eq(modelSwitchProfiles.companyId, companyId), eq(modelSwitchProfiles.id, id)))
        .returning({ id: modelSwitchProfiles.id });
      return deleted.length > 0;
    },
  };
}
