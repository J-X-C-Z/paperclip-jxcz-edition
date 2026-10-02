import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { assertTemplateTaskPatch, templateActionDenial, templateMemberReviewPolicy, TEMPLATE_MEMBER_REVIEW_STAGE_ID } from "../services/agent-template-task-policy.js";
import { applyIssueExecutionPolicyTransition, normalizeIssueExecutionPolicy } from "../services/issue-execution-policy.js";

const memberId = "11111111-1111-4111-8111-111111111111";
const leaderId = "22222222-2222-4222-8222-222222222222";
const companyId = "33333333-3333-4333-8333-333333333333";
const member = { id: memberId, companyId, reportsTo: leaderId, metadata: { agentTemplate: { id: "team-member", version: 1, role: "member" } }, permissions: { canCreateTasks: false, canAssignTasks: false, canReviewTasks: false, canManageAgents: false, canCreateAgents: false } };
const leader = { id: leaderId, companyId, metadata: { agentTemplate: { id: "team-leader", version: 1, role: "leader" } }, permissions: { canReviewTasks: true }, status: "idle" };
function database(rows: unknown[]) {
  let index = 0;
  return { select: () => ({ from: () => ({ where: () => Promise.resolve([rows[index++]].filter(Boolean)) }) }) } as unknown as Db;
}

describe("template task permissions", () => {
  it("denies creation, assignment and agent management before legacy grant fallbacks", () => {
    for (const action of ["tasks:assign", "agents:create", "issue:mutate", "agent_config:update", "agent:wake"]) {
      expect(templateActionDenial(member, action, { type: "issue", agentId: leaderId })).toBeTruthy();
    }
    expect(templateActionDenial({ ...member, metadata: null }, "tasks:assign", { type: "issue" })).toBeNull();
    expect(templateActionDenial(member, "issue:mutate", { type: "issue", issueId: "task", assigneeAgentId: memberId })).toBeNull();
  });
  it("allows progress and review submission but denies self completion and policy tampering", () => {
    const issue = { assigneeAgentId: memberId, status: "in_progress" };
    expect(() => assertTemplateTaskPatch(member, issue, { status: "in_review", comment: "Evidence submitted" })).not.toThrow();
    for (const patch of [{ status: "done" }, { status: "cancelled" }, { executionPolicy: null }, { reviewPolicy: "anyone" }, { assigneeAgentId: leaderId }]) {
      expect(() => assertTemplateTaskPatch(member, issue, patch)).toThrow();
    }
  });
});

describe("template member review lifecycle", () => {
  it("installs one server-owned leader stage and preserves other approval stages", async () => {
    const additional = normalizeIssueExecutionPolicy({ stages: [{ type: "approval", participants: [{ type: "user", userId: "board" }] }] })!;
    const policy = await templateMemberReviewPolicy(database([member, leader]), companyId, memberId, additional);
    expect(policy?.stages).toHaveLength(2);
    expect(policy?.stages[0]).toMatchObject({ id: TEMPLATE_MEMBER_REVIEW_STAGE_ID, participants: [{ agentId: leaderId }] });
    const reapplied = await templateMemberReviewPolicy(database([member, leader]), companyId, memberId, policy);
    expect(reapplied).toEqual(policy);
  });
  it("submits to leader, returns rejected work to member and completes approved work", async () => {
    const policy = await templateMemberReviewPolicy(database([member, leader]), companyId, memberId, null);
    const issue = { status: "in_progress", assigneeAgentId: memberId, assigneeUserId: null, executionPolicy: policy, executionState: null };
    const submission = applyIssueExecutionPolicyTransition({ issue, policy, requestedStatus: "in_review", requestedAssigneePatch: {}, actor: { agentId: memberId }, commentBody: "Completed; tests passed" });
    expect(submission.patch).toMatchObject({ status: "in_review", assigneeAgentId: leaderId, executionState: { currentParticipant: { agentId: leaderId }, returnAssignee: { agentId: memberId } } });
    const reviewing = { ...issue, ...submission.patch } as typeof issue;
    const rejected = applyIssueExecutionPolicyTransition({ issue: reviewing, policy, requestedStatus: "in_progress", requestedAssigneePatch: {}, actor: { agentId: leaderId }, commentBody: "Add the missing verification" });
    expect(rejected.patch).toMatchObject({ status: "in_progress", assigneeAgentId: memberId });
    const approved = applyIssueExecutionPolicyTransition({ issue: reviewing, policy, requestedStatus: "done", requestedAssigneePatch: {}, actor: { agentId: leaderId }, commentBody: "Verified against acceptance criteria" });
    expect({ status: "done", ...approved.patch }).toMatchObject({ status: "done", executionState: { status: "completed" } });
    expect(() => assertTemplateTaskPatch(member, reviewing, { status: "done" })).toThrow();
    expect(() => applyIssueExecutionPolicyTransition({ issue: reviewing, policy, requestedStatus: "done", requestedAssigneePatch: {}, actor: { agentId: memberId }, commentBody: "Self approved" })).toThrow();
  });
  it("preserves mandatory review when a leader disappears and permits progress", async () => {
    const policy = await templateMemberReviewPolicy(database([member, leader]), companyId, memberId, null);
    for (const unavailable of [null, { ...leader, status: "paused" }, { ...leader, status: "terminated" }, { ...leader, status: "pending_approval" }]) {
      const preserved = await templateMemberReviewPolicy(database([member, unavailable]), companyId, memberId, policy);
      expect(preserved).toEqual(policy);
      expect(() => applyIssueExecutionPolicyTransition({ issue: { status: "in_progress", assigneeAgentId: memberId, executionState: null }, policy: preserved, requestedStatus: "in_progress", requestedAssigneePatch: {}, actor: { agentId: memberId }, commentBody: "Progress saved" })).not.toThrow();
    }
    const missingManager = await templateMemberReviewPolicy(database([{ ...member, reportsTo: null }]), companyId, memberId, null);
    expect(missingManager).toBeNull();
    expect(await templateMemberReviewPolicy(database([{ ...member, metadata: null }]), companyId, memberId, null)).toBeNull();
  });
  it("rebuilds the leader stage after recovery and starts review rather than completing", async () => {
    const replacementId = "44444444-4444-4444-8444-444444444444";
    const previous = await templateMemberReviewPolicy(database([member, { ...leader, status: "paused" }]), companyId, memberId, null);
    const restored = await templateMemberReviewPolicy(database([{ ...member, reportsTo: replacementId }, { ...leader, id: replacementId }]), companyId, memberId, previous);
    expect(restored?.stages[0].participants[0].agentId).toBe(replacementId);
    const transition = applyIssueExecutionPolicyTransition({ issue: { status: "in_review", assigneeAgentId: memberId, executionState: null }, policy: restored, requestedStatus: "in_review", requestedAssigneePatch: {}, actor: { agentId: memberId }, commentBody: "Resubmitted after manager recovery" });
    expect(transition.patch).toMatchObject({ status: "in_review", assigneeAgentId: replacementId, executionState: { status: "pending" } });
  });
});
