import { describe, expect, it } from "vitest";
import { applyAgentTemplateDefaults, assertTemplateManager, assertTemplateProvenanceUnchanged, assertTemplateAgentManagement, assertTemplateAgentHire, readAgentTemplateMetadata, isTemplateTeamLeader } from "../services/agent-templates.js";
const leader = { id: "leader", companyId: "company", status: "idle", metadata: { agentTemplate: { id: "team-leader", version: 1, role: "leader" } }, permissions: { canManageAgents: true } };
const member = { id: "member", companyId: "company", reportsTo: "leader", metadata: { agentTemplate: { id: "team-member", version: 1, role: "member" } } };
describe("agent templates", () => {
  it("applies defaults before validation and preserves explicit instance configuration", () => {
    const defaults = applyAgentTemplateDefaults({ templateId: "team-member", name: "Worker", reportsTo: "leader" });
    expect(defaults.role).toBe("general");
    expect(defaults.adapterConfig).toEqual({ model: "gpt-6-luna" });
    expect(defaults.permissions).toMatchObject({ canCreateAgents: false, canCreateTasks: false, canAssignTasks: false, canReviewTasks: false, canManageAgents: false });
    expect(defaults.instructionsBundle).toMatchObject({ entryFile: "AGENTS.md" });
    const custom = applyAgentTemplateDefaults({ templateId: "team-leader", adapterConfig: { model: "custom" }, permissions: { canCreateTasks: false }, desiredSkills: [] });
    expect(custom.adapterConfig).toEqual({ model: "custom" });
    expect(custom.permissions).toMatchObject({ canCreateTasks: false, canReviewTasks: true });
    expect(custom.desiredSkills).toEqual([]);
  });
  it("rejects unknown templates and forged or removed provenance", () => {
    expect(() => applyAgentTemplateDefaults({ templateId: "missing" })).toThrow();
    expect(() => applyAgentTemplateDefaults({ metadata: member.metadata })).toThrow();
    expect(() => assertTemplateProvenanceUnchanged(member.metadata, {})).toThrow();
    expect(() => assertTemplateProvenanceUnchanged(member.metadata, leader.metadata)).toThrow();
    expect(() => assertTemplateProvenanceUnchanged(member.metadata, { ...member.metadata, note: "custom" })).not.toThrow();
  });
  it("requires an available same-company template leader", () => {
    expect(() => assertTemplateManager(member, leader)).not.toThrow();
    for (const invalid of [null, { ...leader, companyId: "other" }, { ...leader, status: "paused" }, { ...leader, metadata: member.metadata }]) {
      expect(() => assertTemplateManager(member, invalid)).toThrow();
    }
    expect(() => assertTemplateManager({ ...member, reportsTo: null }, leader)).toThrow();
  });
  it("prevents member management and leader authority changes or cross-team management", () => {
    expect(() => assertTemplateAgentManagement(member, leader)).toThrow();
    expect(() => assertTemplateAgentManagement(leader, member, { name: "Rename" })).not.toThrow();
    expect(() => assertTemplateAgentManagement(leader, { ...member, reportsTo: "other" })).toThrow();
    expect(() => assertTemplateAgentManagement(leader, member, { permissions: {} })).toThrow();
    expect(() => assertTemplateAgentManagement(leader, leader, { role: "ceo" })).toThrow();
  });
});


describe("department head and custom template boundaries", () => {
  const head = { ...leader, id: "head", metadata: { agentTemplate: { id: "department-head", version: 1, role: "department_head" } }, permissions: { canManageAgents: true, canCreateAgents: true } };
  const custom = { ...member, id: "specialist", reportsTo: null, metadata: { agentTemplate: { id: "custom", version: 1, role: "custom" } }, permissions: { canManageAgents: false, canCreateAgents: false } };
  it("uses distinct provenance and neutral custom defaults without forcing a group leader", () => {
    expect(readAgentTemplateMetadata(head.metadata)?.role).toBe("department_head");
    expect(readAgentTemplateMetadata(custom.metadata)?.role).toBe("custom");
    const defaults = applyAgentTemplateDefaults({ templateId: "custom", title: "Designer", adapterConfig: { model: "chosen-model" }, desiredSkills: [], instructionsBundle: { files: { "AGENTS.md": "Design tasks" } } });
    expect(defaults).toMatchObject({ title: "Designer", adapterConfig: { model: "chosen-model" }, desiredSkills: [], permissions: { canCreateSkills: false, canManageAgents: false, canCreateAgents: false, canAssignTasks: false, canCreateTasks: false, canReviewTasks: false } });
    expect(() => assertTemplateManager(custom, null)).not.toThrow();
    expect(() => assertTemplateManager({ ...custom, reportsTo: "manager" }, { ...leader, companyId: "foreign" })).toThrow();
    expect(() => assertTemplateManager({ ...custom, reportsTo: "manager" }, leader)).not.toThrow();
  });
  it("allows company executives above heads and heads above leaders, never foreign or unavailable managers", () => {
    const input = { ...head, reportsTo: "ceo" };
    expect(() => assertTemplateManager(input, { ...leader, role: "ceo", reportsTo: null })).not.toThrow();
    expect(() => assertTemplateManager(input, { ...leader, role: "general", reportsTo: "ceo" })).toThrow();
    expect(() => assertTemplateManager(input, { ...leader, role: "ceo", companyId: "foreign", reportsTo: null })).toThrow();
    expect(() => assertTemplateManager({ ...leader, reportsTo: head.id }, { ...head, status: "paused" })).toThrow();
    expect(() => assertTemplateManager({ ...leader, reportsTo: head.id }, head)).not.toThrow();
    expect(() => assertTemplateManager({ ...member, reportsTo: head.id }, head)).toThrow();
  });
  it("restricts head management and hiring to own leaders and preserves member hire authority checks", () => {
    const directLeader = { ...leader, reportsTo: head.id };
    const awLeader = { ...directLeader, metadata: { awRoleId: "desktop-lead" } };
    expect(isTemplateTeamLeader(awLeader)).toBe(true);
    expect(() => assertTemplateAgentManagement(head, awLeader, { name: "Renamed" })).not.toThrow();
    expect(() => assertTemplateAgentManagement(head, { ...directLeader, metadata: null, title: "桌面端开发组长" })).not.toThrow();
    expect(() => assertTemplateAgentManagement(head, { ...directLeader, metadata: { awRoleId: "desktop-coder" }, title: "组员" })).toThrow();
    expect(isTemplateTeamLeader({ ...member, title: "组长" })).toBe(false);
    expect(() => assertTemplateAgentManagement(head, directLeader, { name: "Renamed" })).not.toThrow();
    expect(() => assertTemplateAgentManagement(head, { ...directLeader, companyId: "foreign" })).toThrow();
    expect(() => assertTemplateAgentManagement(head, { ...directLeader, reportsTo: "other-head" })).toThrow();
    expect(() => assertTemplateAgentManagement(head, { ...member, reportsTo: head.id })).toThrow();
    expect(() => assertTemplateAgentManagement(head, directLeader, { reportsTo: "other-head" })).toThrow();
    expect(() => assertTemplateAgentHire(head, { templateId: "team-leader", reportsTo: head.id })).not.toThrow();
    expect(() => assertTemplateAgentHire(head, { templateId: "team-member", reportsTo: head.id })).toThrow();
    expect(() => assertTemplateAgentHire({ ...leader, permissions: { canCreateAgents: true } }, { templateId: "team-member", reportsTo: leader.id })).not.toThrow();
    expect(() => assertTemplateAgentHire({ ...leader, permissions: { canCreateAgents: true } }, { templateId: "team-member", reportsTo: leader.id, permissions: { canManageAgents: true } })).toThrow();
    expect(() => assertTemplateAgentHire(custom, { templateId: "team-member", reportsTo: custom.id })).toThrow();
    expect(() => assertTemplateAgentManagement(custom, leader)).toThrow();
  });
});
