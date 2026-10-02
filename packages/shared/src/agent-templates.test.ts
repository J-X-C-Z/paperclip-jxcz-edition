import { describe, expect, it } from "vitest";
import { AGENT_TEMPLATES, agentTemplateSchema, getAgentTemplate } from "./agent-templates.js";
import { agentPermissionsSchema, createAgentHireSchema, createAgentSchema, updateAgentSchema, updateAgentPermissionsSchema } from "./validators/agent.js";

describe("agent templates", () => {
  it("ships four valid presets with distinct models and authority", () => {
    expect(AGENT_TEMPLATES).toHaveLength(4);
    for (const template of AGENT_TEMPLATES) expect(agentTemplateSchema.safeParse(template).success).toBe(true);
    expect(getAgentTemplate("team-leader")).toMatchObject({ role: "leader", model: { modelId: "gpt-6.1-sol" }, permissions: { reviewTask: true } });
    expect(getAgentTemplate("team-member")).toMatchObject({ role: "member", model: { modelId: "gpt-6-luna" }, permissions: { createTask: false, assignTask: false, reviewTask: false, manageAgents: false } });
    expect(getAgentTemplate("department-head")).toMatchObject({ role: "department_head", permissions: { manageAgents: true, reviewTask: true } });
    expect(getAgentTemplate("custom")).toMatchObject({ role: "custom", permissions: { createTask: false, assignTask: false, reviewTask: false, manageAgents: false } });
    expect(getAgentTemplate("unknown")).toBeNull();
  });
  it("keeps per-agent overrides detached from catalog defaults", () => {
    const template = getAgentTemplate("team-leader")!;
    template.model.modelId = "custom-model";
    template.skills.length = 0;
    template.permissions.reviewTask = false;
    expect(getAgentTemplate("team-leader")!.model.modelId).toBe("gpt-6.1-sol");
    expect(getAgentTemplate("team-leader")!.skills).toHaveLength(4);
    expect(getAgentTemplate("team-leader")!.permissions.reviewTask).toBe(true);
  });
  it("accepts templates on creation and hire while preserving legacy callers", () => {
    const legacy = { name: "Worker", adapterType: "codex_local" };
    expect(createAgentSchema.parse(legacy).templateId).toBeUndefined();
    expect(createAgentHireSchema.parse({ ...legacy, templateId: "team-member" }).templateId).toBe("team-member");
    expect(updateAgentSchema.parse({ templateId: "team-member", title: "Updated" })).toEqual({ title: "Updated" });
  });
  it("validates explicit permissions without imposing them on legacy agents", () => {
    const permissions = { canCreateTasks: false, canAssignTasks: false, canReviewTasks: false, canManageAgents: false };
    expect(agentPermissionsSchema.parse(permissions)).toMatchObject(permissions);
    expect(agentPermissionsSchema.parse({})).not.toHaveProperty("canReviewTasks");
    expect(agentPermissionsSchema.safeParse({ canReviewTasks: "yes" }).success).toBe(false);
    expect(updateAgentPermissionsSchema.parse({ canCreateAgents: false, ...permissions })).toMatchObject(permissions);
  });
});
