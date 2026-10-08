import { and, eq } from "drizzle-orm";
import { companies, companyAgentTemplateDefaults, companySkills, type Db } from "@paperclipai/db";
import { listCatalogSkills } from "./skills-catalog.js";
import { notFound } from "../errors.js";
import { AGENT_TEMPLATES, getAgentTemplate, updateAgentTemplateSkillsSchema, updateAgentTemplateDefaultsSchema, type AgentTemplate, type AgentTemplateMetadata } from "@paperclipai/shared";
import { forbidden, unprocessable } from "../errors.js";

export { AGENT_TEMPLATES };
export function readAgentTemplateMetadata(metadata: unknown): AgentTemplateMetadata | null {
  const marker = record(record(metadata).agentTemplate);
  return typeof marker.id === "string" && typeof marker.version === "number" && ["department_head", "leader", "member", "custom"].includes(String(marker.role))
    ? marker as unknown as AgentTemplateMetadata : null;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Called before Zod defaults: absent fields inherit, explicit values win. */
export function applyAgentTemplateDefaults(input: Record<string, unknown>, templates: readonly AgentTemplate[] = AGENT_TEMPLATES): Record<string, unknown> {
  const metadata = record(input.metadata);
  if (!input.templateId) {
    if (Object.hasOwn(metadata, "agentTemplate")) throw forbidden("Template provenance is server managed");
    return input;
  }
  const template = typeof input.templateId === "string" ? templates.find(entry => entry.id === input.templateId) : null;
  if (!template) throw unprocessable("Unknown agent template");
  const { permissions } = template;
  return {
    role: "general", capabilities: template.description,
    ...input,
    adapterConfig: { model: template.model.modelId, ...(template.model.reasoningEffort ? { modelReasoningEffort: template.model.reasoningEffort } : {}), ...(input.adapterType === "paperclip_runner" ? { provider: template.model.provider } : {}), ...record(input.adapterConfig) },
    instructionsBundle: input.instructionsBundle ?? { entryFile: "AGENTS.md", files: { "AGENTS.md": template.systemPrompt } },
    desiredSkills: input.desiredSkills ?? [...template.skills],
    permissions: { canCreateSkills: template.role === "leader" || template.role === "department_head", canCreateAgents: permissions.manageAgents, canCreateTasks: permissions.createTask, canAssignTasks: permissions.assignTask, canReviewTasks: permissions.reviewTask, canManageAgents: permissions.manageAgents, ...record(input.permissions) },
    metadata: { ...metadata, agentTemplate: { id: template.id, version: template.version, role: template.role } },
  };
}
export function assertTemplateProvenanceUnchanged(existingMetadata: unknown, nextMetadata: unknown) {
  if (nextMetadata === undefined) return;
  if (JSON.stringify(record(existingMetadata).agentTemplate) !== JSON.stringify(record(nextMetadata).agentTemplate)) {
    throw forbidden("Template provenance cannot be changed or removed");
  }
}
export function assertTemplateManager(input: { companyId: string; metadata?: unknown; reportsTo?: string | null }, manager: { companyId: string; metadata?: unknown; status: string; role?: string; reportsTo?: string | null } | null) {
  const role = readAgentTemplateMetadata(input.metadata)?.role;
  if (!role) return;
  if (!input.reportsTo) {
    if (role === "member") throw unprocessable("Template members must report to an active team leader in the same company");
    return;
  }
  if (!manager || manager.companyId !== input.companyId || !["idle", "running", "error"].includes(manager.status)) {
    throw unprocessable("Template agents must report to an active manager in the same company");
  }
  const managerRole = readAgentTemplateMetadata(manager.metadata)?.role;
  if (role === "member" && managerRole !== "leader") throw unprocessable("Template members must report to an active team leader in the same company");
  if (role === "department_head" && manager.role !== "ceo" && manager.reportsTo !== null) throw unprocessable("Department heads must report to a company executive or root manager");
}

/** Recognizes native presets and legacy AW group leaders without treating members as managers. */
export function isTemplateTeamLeader(agent: { metadata?: unknown; name?: string; title?: string | null }): boolean {
  const template = readAgentTemplateMetadata(agent.metadata);
  if (template) return template.role === "leader";
  const metadata = record(agent.metadata);
  return typeof metadata.awRoleId === "string" && metadata.awRoleId.endsWith("-lead") ||
    [agent.title, agent.name].some(value => typeof value === "string" && /组长/.test(value));
}

/** Template authority never expands beyond company and direct reporting boundaries. */
export function assertTemplateAgentManagement(actor: { id: string; companyId?: string; metadata?: unknown; permissions?: Record<string, unknown> }, target: { id: string; companyId?: string; metadata?: unknown; reportsTo?: string | null; name?: string; title?: string | null }, patch?: Record<string, unknown>) {
  const marker = readAgentTemplateMetadata(actor.metadata);
  if (!marker) return;
  if (actor.companyId && target.companyId && actor.companyId !== target.companyId) throw forbidden("Template agents cannot manage another company");
  const isSelf = target.id === actor.id;
  const canManage = actor.permissions?.canManageAgents === true;
  const managesDirect = canManage && target.reportsTo === actor.id;
  const allowed = marker.role === "custom" ? isSelf || canManage
    : marker.role === "leader" ? canManage && (isSelf || managesDirect)
      : marker.role === "department_head" ? canManage && (isSelf || managesDirect && isTemplateTeamLeader(target))
        : false;
  if (!allowed) throw forbidden("Template agents may only manage their authorized direct reports");
  if (patch && ["permissions", "role", "reportsTo"].some(key => Object.hasOwn(patch, key))) throw forbidden("Agent authority and reporting relationships require board authorization");
}

export function assertTemplateAgentHire(actor: { id: string; metadata?: unknown; permissions?: Record<string, unknown> }, input: Record<string, unknown>) {
  const role = readAgentTemplateMetadata(actor.metadata)?.role;
  if (!role) return;
  if (actor.permissions?.canCreateAgents !== true) throw forbidden("This template agent cannot hire agents");
  if (role === "custom") return;
  const childTemplate = role === "department_head" ? "team-leader" : role === "leader" ? "team-member" : null;
  if (!childTemplate || input.templateId !== childTemplate || input.reportsTo !== actor.id) throw forbidden("Template managers may only hire their own direct reporting role");
  if (input.role === "ceo") throw forbidden("Template managers cannot hire company executives");
  if (role === "leader" && ["canCreateAgents", "canCreateTasks", "canAssignTasks", "canReviewTasks", "canManageAgents"].some(key => record(input.permissions)[key] === true)) throw forbidden("Hiring agents cannot elevate member authority");
}


export function mergeAgentTemplateSkills(overrides: { templateId: string; skills: string[]; systemPrompt?: string | null }[]): AgentTemplate[] {
  return AGENT_TEMPLATES.map((template) => {
    const override = overrides.find(row => row.templateId === template.id);
    return {
      ...structuredClone(template),
      skills: [...(override?.skills ?? template.skills)],
      systemPrompt: override?.systemPrompt ?? template.systemPrompt,
    };
  });
}

export function agentTemplateDefaultsService(db: Db) {
  async function save(companyId: string, templateId: string, input: unknown, skillsOnly: boolean) {
    const template = getAgentTemplate(templateId);
    if (!template) throw notFound("Agent template not found");
    const values = skillsOnly ? updateAgentTemplateSkillsSchema.parse(input) : updateAgentTemplateDefaultsSchema.parse(input);
    const { skills } = values;
    const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!company) throw notFound("Company not found");
    const local = await db.select({ key: companySkills.key }).from(companySkills).where(eq(companySkills.companyId, companyId));
    const available = new Set([...listCatalogSkills().map(skill => skill.key), ...local.map(skill => skill.key)]);
    if (skills.some(key => !available.has(key))) throw unprocessable("Choose Skills from the catalog or this organization.");
    // The legacy Skills endpoint leaves any saved Instructions intact.
    const patch = { skills, ...("systemPrompt" in values ? { systemPrompt: values.systemPrompt as string } : {}), updatedAt: new Date() };
    await db.insert(companyAgentTemplateDefaults).values({ companyId, templateId, ...patch })
      .onConflictDoUpdate({ target: [companyAgentTemplateDefaults.companyId, companyAgentTemplateDefaults.templateId], set: patch });
    const rows = await db.select().from(companyAgentTemplateDefaults)
      .where(and(eq(companyAgentTemplateDefaults.companyId, companyId), eq(companyAgentTemplateDefaults.templateId, templateId)));
    return mergeAgentTemplateSkills(rows).find(entry => entry.id === templateId)!;
  }
  return {
    async list(companyId: string) {
      const rows = await db.select().from(companyAgentTemplateDefaults)
        .where(eq(companyAgentTemplateDefaults.companyId, companyId));
      return mergeAgentTemplateSkills(rows);
    },
    updateSkills: (companyId: string, templateId: string, input: unknown) => save(companyId, templateId, input, true),
    updateDefaults: (companyId: string, templateId: string, input: unknown) => save(companyId, templateId, input, false),
  };
}
