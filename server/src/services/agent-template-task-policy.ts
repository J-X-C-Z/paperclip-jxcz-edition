import { and, eq } from "drizzle-orm";
import { agents, type Db } from "@paperclipai/db";
import type { IssueExecutionPolicy } from "@paperclipai/shared";
import { forbidden, unprocessable } from "../errors.js";
import { readAgentTemplateMetadata } from "./agent-templates.js";
import { normalizeIssueExecutionPolicy, parseIssueExecutionState } from "./issue-execution-policy.js";

export const TEMPLATE_MEMBER_REVIEW_STAGE_ID = "9bd407e9-89d7-4a0b-a802-72c54f71c001";
type TemplateActor = { id: string; companyId: string; metadata?: unknown; permissions?: Record<string, unknown> | null };

/** Explicit template denials precede legacy defaults, grants and CEO shortcuts. */
export function templateActionDenial(actor: TemplateActor, action: string, resource: { type: string; issueId?: string | null; assigneeAgentId?: string | null; agentId?: string | null }): string | null {
  const template = readAgentTemplateMetadata(actor.metadata);
  if (!template) return null;
  const permissions = actor.permissions ?? {};
  if (action === "tasks:assign" && permissions.canAssignTasks !== true) return "Template agent cannot assign tasks";
  if (action === "agents:create" && permissions.canCreateAgents !== true) return "Template agent cannot create agents";
  if (action === "issue:mutate" && !resource.issueId && permissions.canCreateTasks !== true) return "Template agent cannot create tasks";
  if (template.role === "member" && ["issue:mutate", "issue:comment"].includes(action) && resource.assigneeAgentId !== actor.id) return "Template members may only write their assigned tasks";
  if (["agent_config:update", "agent:wake", "agents:configure", "agents:delete", "agents:pause"].includes(action) && resource.agentId !== actor.id && permissions.canManageAgents !== true) return "Template agent cannot manage other agents";
  return null;
}

export function assertTemplateTaskPatch(actor: TemplateActor, issue: { assigneeAgentId?: string | null; executionState?: unknown; status: string }, patch: Record<string, unknown>, rawRequest = true) {
  const template = readAgentTemplateMetadata(actor.metadata);
  if (!template) return;
  const state = parseIssueExecutionState(issue.executionState);
  const ownsExecution = issue.assigneeAgentId === actor.id || state?.returnAssignee?.agentId === actor.id;
  if (template.role === "member" && ownsExecution && ["done", "cancelled"].includes(String(patch.status))) throw forbidden("Submit the task for team leader review; members cannot complete or cancel their own tasks");
  if (issue.status === "in_review" && patch.status !== undefined && patch.status !== "in_review" && actor.permissions?.canReviewTasks !== true) throw forbidden("Template agent cannot approve or reject task reviews");
  if (rawRequest && template.role === "member" && ["executionPolicy", "executionState", "reviewPolicy", "reviewInteractionId", "parentId"].some(key => Object.hasOwn(patch, key))) throw forbidden("Members cannot change their task review policy or execution boundary");
  if (rawRequest && actor.permissions?.canAssignTasks !== true && (Object.hasOwn(patch, "assigneeAgentId") || Object.hasOwn(patch, "assigneeUserId"))) throw forbidden("Template agent cannot reassign tasks");
}

export async function loadTemplateTaskActor(db: Db, companyId: string, actorId?: string | null): Promise<TemplateActor | null> {
  if (!actorId) return null;
  return db.select().from(agents).where(and(eq(agents.id, actorId), eq(agents.companyId, companyId))).then(rows => rows[0] ?? null);
}

/** Server-owned review stage survives every assignment and policy change. */
export async function templateMemberReviewPolicy(db: Db, companyId: string, memberId: string | null | undefined, policy: unknown): Promise<IssueExecutionPolicy | null> {
  const member = await loadTemplateTaskActor(db, companyId, memberId);
  const normalized = normalizeIssueExecutionPolicy(policy as Record<string, unknown> | null);
  if (!member || readAgentTemplateMetadata(member.metadata)?.role !== "member") return normalized;
  const row = member as TemplateActor & { reportsTo?: string | null };
  const leader = row.reportsTo ? await loadTemplateTaskActor(db, companyId, row.reportsTo) : null;
  const availableLeader = leader && readAgentTemplateMetadata(leader.metadata)?.role === "leader" && ["idle", "running", "error"].includes(String((leader as TemplateActor & { status?: string }).status));
  const previousMandatoryStage = normalized?.stages.find(stage => stage.id === TEMPLATE_MEMBER_REVIEW_STAGE_ID);
  // A missing reviewer must not prevent progress or discard an existing gate.
  // The submission route provides a human recovery interaction while this gate
  // is unavailable, then resubmission rebuilds it from the restored manager.
  const reviewStage = availableLeader
    ? { id: TEMPLATE_MEMBER_REVIEW_STAGE_ID, type: "review" as const, approvalsNeeded: 1 as const, participants: [{ id: leader.id, type: "agent" as const, agentId: leader.id }] }
    : previousMandatoryStage ?? (row.reportsTo ? { id: TEMPLATE_MEMBER_REVIEW_STAGE_ID, type: "review" as const, approvalsNeeded: 1 as const, participants: [{ id: row.reportsTo, type: "agent" as const, agentId: row.reportsTo }] } : null);
  return normalizeIssueExecutionPolicy({
    ...(normalized ?? {}),
    commentRequired: true,
    stages: [...(reviewStage ? [reviewStage] : []), ...(normalized?.stages ?? []).filter(stage => stage.id !== TEMPLATE_MEMBER_REVIEW_STAGE_ID)],
  });
}
