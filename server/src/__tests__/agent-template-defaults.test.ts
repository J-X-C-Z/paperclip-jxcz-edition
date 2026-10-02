import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { companies, companyAgentTemplateDefaults, companySkills, type Db } from "@paperclipai/db";
import { AGENT_TEMPLATES, updateAgentTemplateSkillsSchema, updateAgentTemplateDefaultsSchema } from "@paperclipai/shared";
import {
  agentTemplateDefaultsService,
  applyAgentTemplateDefaults,
  mergeAgentTemplateSkills,
} from "../services/agent-templates.js";

function template(id: string) {
  return AGENT_TEMPLATES.find((entry) => entry.id === id)!;
}

describe("company agent template defaults", () => {
  it("keeps catalog defaults when there are no overrides and returns detached templates", () => {
    const before = structuredClone(AGENT_TEMPLATES);
    const merged = mergeAgentTemplateSkills([]);

    expect(merged.map((entry) => entry.skills)).toEqual(AGENT_TEMPLATES.map((entry) => entry.skills));
    merged[0]!.skills.push("company-only/skill");
    expect(AGENT_TEMPLATES).toEqual(before);
  });

  it("applies company skills to new agents while preserving caller supplied skills, including an empty list", () => {
    const companyTemplates = mergeAgentTemplateSkills([
      { templateId: "team-member", skills: ["company/custom-skill"] },
    ]);

    expect(applyAgentTemplateDefaults({ templateId: "team-member" }, companyTemplates).desiredSkills)
      .toEqual(["company/custom-skill"]);
    expect(applyAgentTemplateDefaults({ templateId: "team-member", desiredSkills: ["agent/choice"] }, companyTemplates).desiredSkills)
      .toEqual(["agent/choice"]);
    expect(applyAgentTemplateDefaults({ templateId: "team-member", desiredSkills: [] }, companyTemplates).desiredSkills)
      .toEqual([]);
    expect(template("team-member").skills).not.toEqual(["company/custom-skill"]);
  });

  it("copies saved Markdown into new instruction bundles, while existing bundles and catalog remain unchanged", () => {
    const markdown = "# Team procedure\n\n- Verify evidence before submission.\n";
    const templates = mergeAgentTemplateSkills([{ templateId: "team-member", skills: [], systemPrompt: markdown }]);
    const firstAgent = applyAgentTemplateDefaults({ templateId: "team-member" }, templates);
    expect(firstAgent.instructionsBundle).toEqual({ entryFile: "AGENTS.md", files: { "AGENTS.md": markdown } });
    const explicitBundle = { entryFile: "AGENTS.md", files: { "AGENTS.md": "Agent-specific instructions" } };
    expect(applyAgentTemplateDefaults({ templateId: "team-member", instructionsBundle: explicitBundle }, templates).instructionsBundle).toBe(explicitBundle);
    templates.find(entry => entry.id === "team-member")!.systemPrompt = "Later template change";
    expect(firstAgent.instructionsBundle).toEqual({ entryFile: "AGENTS.md", files: { "AGENTS.md": markdown } });
    expect(template("team-member").systemPrompt).not.toBe(markdown);
    expect(mergeAgentTemplateSkills([{ templateId: "team-member", skills: [], systemPrompt: null }]).find(entry => entry.id === "team-member")!.systemPrompt).toBe(template("team-member").systemPrompt);
    expect(updateAgentTemplateDefaultsSchema.parse({ skills: [], systemPrompt: markdown }).systemPrompt).toBe(markdown);
    expect(updateAgentTemplateDefaultsSchema.safeParse({ skills: [], systemPrompt: "  \n " }).success).toBe(false);
    expect(updateAgentTemplateDefaultsSchema.safeParse({ skills: [], systemPrompt: "x".repeat(100_001) }).success).toBe(false);
  });

  it("persists Instructions per company and keeps them when a legacy Skills update runs", async () => {
    const rows = new Map<string, { companyId: string; templateId: string; skills: string[]; systemPrompt?: string | null }>();
    const db = {
      select: () => ({ from: (table: unknown) => ({ where: async (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const params = new PgDialect().sqlToQuery(condition).params;
        if (table === companies) return [{ id: params[0] }];
        if (table === companySkills) return [];
        return [...rows.values()].filter(row => row.companyId === params[0] && (!params[1] || row.templateId === params[1]));
      } }) }),
      insert: () => ({ values: (value: { companyId: string; templateId: string; skills: string[]; systemPrompt?: string }) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          const key = `${value.companyId}:${value.templateId}`;
          rows.set(key, { ...(rows.get(key) ?? value), ...set } as typeof value);
        },
      }) }),
    } as unknown as Db;
    const service = agentTemplateDefaultsService(db);
    const markdown = "# Organization A\n\nFollow our workflow.\n";
    const saved = await service.updateDefaults("company-a", "team-member", { skills: [], systemPrompt: markdown });
    expect(saved.systemPrompt).toBe(markdown);
    expect((await service.list("company-a")).find(entry => entry.id === "team-member")!.systemPrompt).toBe(markdown);
    expect((await service.list("company-b")).find(entry => entry.id === "team-member")!.systemPrompt).toBe(template("team-member").systemPrompt);
    expect((await service.updateSkills("company-a", "team-member", { skills: [] })).systemPrompt).toBe(markdown);
  });

  it("validates skill update shape, uniqueness, and nonempty keys", () => {
    expect(updateAgentTemplateSkillsSchema.parse({ skills: [" task-planning "] })).toEqual({ skills: ["task-planning"] });
    expect(updateAgentTemplateSkillsSchema.safeParse({ skills: ["same", " same "] }).success).toBe(false);
    expect(updateAgentTemplateSkillsSchema.safeParse({ skills: [""] }).success).toBe(false);
    expect(updateAgentTemplateSkillsSchema.safeParse({ skills: ["valid"], extra: true }).success).toBe(false);
  });

  it("lists company-specific overrides and rejects unknown templates and unavailable skills", async () => {
    const rowsByCompany: Record<string, { templateId: string; skills: string[] }[]> = {
      "company-a": [{ templateId: "team-member", skills: ["company-a/member-skill"] }],
      "company-b": [{ templateId: "team-member", skills: ["company-b/member-skill"] }],
    };
    const selectedTables: unknown[] = [];
    const predicates: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    let inserted = false;
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: async (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            selectedTables.push(table);
            const query = new PgDialect().sqlToQuery(condition);
            predicates.push(query);
            if (table === companyAgentTemplateDefaults) {
              const companyId = query.params.find((param) => typeof param === "string" && param.startsWith("company-")) as string;
              return rowsByCompany[companyId] ?? [];
            }
            if (table === companies) return [{ id: "company-a" }];
            if (table === companySkills) return [];
            throw new Error("Unexpected selected table");
          },
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => { inserted = true; },
        }),
      }),
    } as unknown as Db;
    const service = agentTemplateDefaultsService(db);

    const companyA = await service.list("company-a");
    const companyB = await service.list("company-b");
    expect(companyA.find((entry) => entry.id === "team-member")?.skills).toEqual(["company-a/member-skill"]);
    expect(companyB.find((entry) => entry.id === "team-member")?.skills).toEqual(["company-b/member-skill"]);
    expect(predicates.slice(0, 2).map((query) => query.params)).toEqual([["company-a"], ["company-b"]]);

    await expect(service.updateSkills("company-a", "missing-template", { skills: [] })).rejects.toThrow("Agent template not found");
    await expect(service.updateSkills("company-a", "team-member", { skills: ["not-a-real-skill"] }))
      .rejects.toThrow("Choose Skills from the catalog or this organization.");
    expect(inserted).toBe(false);
    expect(selectedTables.slice(2)).toContain(companies);
    expect(selectedTables.slice(2)).toContain(companySkills);
  });
});
