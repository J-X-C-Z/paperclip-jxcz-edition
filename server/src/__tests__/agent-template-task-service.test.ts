import { agentService } from "../services/agents.js";
import { commitNativeStatusDecision } from "../services/native-runtime/status-decision-committer.js";
import { NATIVE_STATUS_ARBITER_POLICY_VERSION } from "../services/native-runtime/status-arbiter.js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, createDb, completionContracts, heartbeatRuns, nativeRunResults, workAssessments, nativeRunFinalizations, issues, issueThreadInteractions, statusDecisions } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.js";
import { TEMPLATE_MEMBER_REVIEW_STAGE_ID } from "../services/agent-template-task-policy.js";

const support = await getEmbeddedPostgresTestSupport();
const supported = support.supported ? describe : describe.skip;
supported("template task service enforcement", () => {
  let cluster: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const extraClusters: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>[] = [];
  afterAll(async () => { await cluster?.cleanup(); for (const extra of extraClusters) await extra.cleanup(); });
  it("enforces review even for direct service and interaction writes", async () => {
    cluster = await startEmbeddedPostgresTestDatabase("paperclip-template-task-");
    const db = createDb(cluster.connectionString);
    const companyId = randomUUID(), leaderId = randomUUID(), memberId = randomUUID(), otherLeaderId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Template QA", issuePrefix: "TPQA" });
    const leaderMetadata = { agentTemplate: { id: "team-leader", version: 1, role: "leader" } };
    await db.insert(agents).values([
      { id: leaderId, companyId, name: "Lead", status: "idle", metadata: leaderMetadata, permissions: { canCreateTasks: true, canReviewTasks: true } },
      { id: otherLeaderId, companyId, name: "Other lead", status: "idle", metadata: leaderMetadata, permissions: { canReviewTasks: true } },
      { id: memberId, companyId, name: "Member", status: "idle", reportsTo: leaderId, metadata: { agentTemplate: { id: "team-member", version: 1, role: "member" } }, permissions: { canCreateTasks: false, canAssignTasks: false, canReviewTasks: false } },
    ]);
    const svc = issueService(db);
    await expect(svc.create(companyId, { title: "Forbidden child", createdByAgentId: memberId })).rejects.toThrow("cannot create tasks");
    const task = await svc.create(companyId, { title: "Deliver a result", status: "todo", assigneeAgentId: memberId, createdByAgentId: leaderId });
    expect(task.executionPolicy).toMatchObject({ stages: [{ id: TEMPLATE_MEMBER_REVIEW_STAGE_ID, participants: [{ agentId: leaderId }] }] });
    await svc.update(task.id, { status: "in_progress", actorAgentId: memberId });
    await expect(svc.update(task.id, { assigneeAgentId: otherLeaderId, actorAgentId: memberId })).rejects.toThrow("cannot reassign");
    const otherTask = await svc.create(companyId, { title: "Someone else's task", assigneeAgentId: otherLeaderId, createdByAgentId: leaderId });
    await expect(svc.update(otherTask.id, { description: "Unauthorized edit", actorAgentId: memberId })).rejects.toThrow("assigned tasks");

    await expect(svc.update(task.id, { status: "done", actorAgentId: memberId })).rejects.toThrow("members cannot complete");
    const submitted = await svc.update(task.id, { status: "in_review", actorAgentId: memberId });
    expect(submitted).toMatchObject({ status: "in_review", assigneeAgentId: leaderId });
    await expect(svc.update(task.id, { status: "done", actorAgentId: otherLeaderId })).rejects.toThrow("current team reviewer");
    await expect(svc.update(task.id, { status: "todo", actorAgentId: memberId })).rejects.toThrow();
    const returned = await svc.update(task.id, { status: "todo", actorAgentId: leaderId });
    expect(returned).toMatchObject({ status: "in_progress", assigneeAgentId: memberId });
    await svc.update(task.id, { status: "in_review", actorAgentId: memberId });
    const completed = await svc.update(task.id, { status: "done", actorAgentId: leaderId });
    expect(completed).toMatchObject({ status: "done", executionState: { status: "completed" } });
    const recoveryTask = await svc.create(companyId, { title: "Review during outage", status: "in_progress", assigneeAgentId: memberId, createdByAgentId: leaderId });
    await db.update(agents).set({ status: "paused" }).where(eq(agents.id, leaderId));
    const pendingRecovery = await svc.update(recoveryTask.id, { status: "in_review", actorAgentId: memberId });
    expect(pendingRecovery).toMatchObject({ status: "in_review", assigneeAgentId: memberId, executionState: null });
    expect(pendingRecovery?.reviewPolicy).not.toBe("human_only");
    const recoveryCards = await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.issueId, recoveryTask.id));
    expect(recoveryCards).toHaveLength(1);
    expect(recoveryCards[0]).toMatchObject({ status: "pending", effectiveResolverPolicy: "human_only", continuationPolicy: "none" });
    await svc.update(recoveryTask.id, { status: "in_review", actorAgentId: memberId });
    expect(await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.issueId, recoveryTask.id))).toHaveLength(1);
    await db.update(agents).set({ status: "idle" }).where(eq(agents.id, leaderId));
    const resubmitted = await svc.update(recoveryTask.id, { status: "in_review", actorAgentId: memberId });
    expect(resubmitted).toMatchObject({ status: "in_review", assigneeAgentId: leaderId, executionState: { status: "pending", currentParticipant: { agentId: leaderId } } });

  }, 90000);
  it("native member completion commits review rather than done, with replay and unavailable-leader recovery", async () => {
    const temporary = await startEmbeddedPostgresTestDatabase("paperclip-template-native-");
    extraClusters.push(temporary);
    const db = createDb(temporary.connectionString);
    const companyId = randomUUID(), leaderId = randomUUID(), memberId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Native template QA", issuePrefix: "NTQA" });
    await db.insert(agents).values([
      { id: leaderId, companyId, name: "Lead", status: "idle", metadata: { agentTemplate: { id: "team-leader", version: 1, role: "leader" } }, permissions: { canCreateTasks: true, canReviewTasks: true } },
      { id: memberId, companyId, name: "Member", status: "running", reportsTo: leaderId, metadata: { agentTemplate: { id: "team-member", version: 1, role: "member" } }, permissions: { canCreateTasks: false, canAssignTasks: false, canReviewTasks: false } },
    ]);
    for (const leaderStatus of ["idle", "paused", "terminated", "deleted"]) {
      await db.update(agents).set({ status: "idle" }).where(eq(agents.id, leaderId));
      const task = await issueService(db).create(companyId, { title: `Native result (${leaderStatus})`, status: "in_progress", assigneeAgentId: memberId, createdByAgentId: leaderId });
      if (leaderStatus === "deleted") {
        await agentService(db).remove(leaderId);
        expect(await db.select().from(issues).where(eq(issues.id, task.id)).then(rows => rows[0])).toMatchObject({ assigneeAgentId: memberId, createdByAgentId: null });
      }
      else await db.update(agents).set({ status: leaderStatus }).where(eq(agents.id, leaderId));
      const runId = randomUUID(), contractId = randomUUID(), resultId = randomUUID(), assessmentId = randomUUID();
      await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId: memberId, status: "running", runtimeMode: "native", nativeIssueId: task.id, completionContractId: contractId, completionContractSha256: contractId, contextSnapshot: { issueId: task.id } });
      await db.insert(completionContracts).values({ id: contractId, companyId, issueId: task.id, revision: 1, schemaVersion: "paperclip.completion-contract.v1", policyVersion: "phase6-v1", risk: "standard", completionAuthority: "server_arbiter", incompleteCriteriaPolicy: "preserve_non_terminal", contractJson: { criteria: [] }, canonicalSha256: contractId, createdByActorType: "system", createdByActorId: "test" });
      await db.insert(nativeRunResults).values({ id: resultId, companyId, issueId: task.id, runId, completionContractId: contractId, serverFingerprint: resultId, schemaStatus: "accepted", resultJson: { result: { summary: "Completed and verified" } }, canonicalSha256: resultId });
      await db.insert(workAssessments).values({ id: assessmentId, companyId, issueId: task.id, runId, contractId, resultId, triggerKind: "native_result", triggerActorCompanyId: companyId, priorIssueStatus: "in_progress", priorStatusVersion: task.statusVersion, policyVersion: NATIVE_STATUS_ARBITER_POLICY_VERSION, assessmentJson: { allCriteriaSatisfied: true }, inputDigest: assessmentId });
      await db.insert(nativeRunFinalizations).values({ runId, companyId, issueId: task.id, phase: "assessing", resultId, assessmentId });
      if (leaderStatus === "terminated") await expect(issueService(db).update(task.id, { assigneeAgentId: memberId, actorAgentId: leaderId })).rejects.toThrow("invalid org chain");
      const input = { db, companyId, issueId: task.id, runId, assessmentId, priorStatus: "in_progress", priorStatusVersion: task.statusVersion, priorDecisionId: task.lastStatusDecisionId, decision: { policyVersion: NATIVE_STATUS_ARBITER_POLICY_VERSION, statusAction: "done" as const, toStatus: "done" as const, reasonCode: "objective_satisfied", unblockDescriptor: null, effects: [] } };
      const committed = await commitNativeStatusDecision(input);
      expect(committed.decision).toMatchObject({ toStatus: "in_review", decisionJson: { statusAction: "in_review", toStatus: "in_review" } });
      const persisted = await db.select().from(issues).where(eq(issues.id, task.id)).then(rows => rows[0]!);
      expect(persisted.status).toBe("in_review");
      expect(persisted.statusVersion).toBe(task.statusVersion + 1);
      expect(persisted.lastStatusDecisionId).toBe(committed.decision.id);
      if (leaderStatus === "idle") {
        expect(persisted).toMatchObject({ assigneeAgentId: leaderId, executionState: { status: "pending", returnAssignee: { agentId: memberId } } });
      } else {
        expect(persisted).toMatchObject({ assigneeAgentId: memberId, executionState: null });
        expect(await db.select().from(issueThreadInteractions).where(eq(issueThreadInteractions.issueId, task.id))).toEqual(expect.arrayContaining([expect.objectContaining({ status: "pending", effectiveResolverPolicy: "human_only", continuationPolicy: "none" })]));
      }
      const replay = await commitNativeStatusDecision(input);
      expect(replay.replayed).toBe(true);
      expect(replay.decision.id).toBe(committed.decision.id);
      expect(await db.select().from(statusDecisions).where(eq(statusDecisions.issueId, task.id))).toHaveLength(1);
      if (leaderStatus === "deleted") {
        await db.update(agents).set({ status: "terminated" }).where(eq(agents.id, memberId));
        await expect(issueService(db).update(task.id, { status: "in_review", actorAgentId: memberId })).rejects.toThrow("terminated");
      }

    }
  }, 90000);

});
