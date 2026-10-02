import { and, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { activityLog, heartbeatRuns, projects, type Db } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";

/** Project scope selects work; company authorization remains the caller's responsibility. */
export async function resolveProjectScope(db: Pick<Db, "select">, companyId: string, raw: unknown) {
  if (raw == null || raw === "") return undefined;
  const parsed = z.string().guid().safeParse(raw);
  if (!parsed.success) throw badRequest("Invalid projectId");
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.id, parsed.data)));
  if (!project) throw notFound("Project not found");
  return project.id;
}

/** Runs require an attributable issue/project, never merely a member agent. */
export function projectRunCondition(companyId: string, projectId: string, run: SQL = sql`${heartbeatRuns}`) {
  return sql<boolean>`(
    ${run}.context_snapshot ->> 'projectId' = ${projectId}
    OR EXISTS (
      SELECT 1 FROM issues AS scope_issue
      WHERE scope_issue.company_id = ${companyId} AND scope_issue.project_id = ${projectId}
        AND scope_issue.hidden_at IS NULL AND scope_issue.harness_kind IS NULL
        AND (scope_issue.id::text = ${run}.context_snapshot ->> 'issueId'
          OR scope_issue.id::text = ${run}.context_snapshot ->> 'taskId'
          OR scope_issue.id = ${run}.native_issue_id
          OR EXISTS (
            SELECT 1 FROM activity_log AS scope_link
            WHERE scope_link.company_id = ${companyId} AND scope_link.run_id = ${run}.id
              AND scope_link.entity_type = 'issue' AND scope_link.entity_id = scope_issue.id::text
          ))
    )
  )`;
}

/** Only explicit project/entity/issue/run relations qualify; membership is not attribution. */
export function projectActivityCondition(companyId: string, projectId: string) {
  return sql<boolean>`(
    (${activityLog.entityType} = 'project' AND ${activityLog.entityId} = ${projectId})
    OR ${activityLog.details} ->> 'projectId' = ${projectId}
    OR EXISTS (
      SELECT 1 FROM issues AS scope_issue
      WHERE scope_issue.company_id = ${companyId} AND scope_issue.project_id = ${projectId}
        AND scope_issue.hidden_at IS NULL AND scope_issue.harness_kind IS NULL
        AND ((${activityLog.entityType} = 'issue' AND ${activityLog.entityId} = scope_issue.id::text)
          OR ${activityLog.details} ->> 'issueId' = scope_issue.id::text
          OR ${activityLog.details} ->> 'sourceIssueId' = scope_issue.id::text
          OR EXISTS (SELECT 1 FROM issue_comments AS scope_comment
            WHERE scope_comment.company_id = ${companyId} AND scope_comment.issue_id = scope_issue.id
              AND ${activityLog.entityType} = 'issue_comment' AND ${activityLog.entityId} = scope_comment.id::text)
          OR EXISTS (SELECT 1 FROM issue_documents AS scope_document
            WHERE scope_document.company_id = ${companyId} AND scope_document.issue_id = scope_issue.id
              AND ${activityLog.entityType} = 'document' AND ${activityLog.entityId} = scope_document.document_id::text)
          OR EXISTS (SELECT 1 FROM issue_work_products AS scope_product
            WHERE scope_product.company_id = ${companyId} AND scope_product.issue_id = scope_issue.id
              AND ${activityLog.entityType} = 'issue_work_product' AND ${activityLog.entityId} = scope_product.id::text)
          OR EXISTS (SELECT 1 FROM issue_approvals AS scope_approval
            WHERE scope_approval.company_id = ${companyId} AND scope_approval.issue_id = scope_issue.id
              AND ${activityLog.entityType} = 'approval' AND ${activityLog.entityId} = scope_approval.approval_id::text)
          OR EXISTS (SELECT 1 FROM workspace_operations AS scope_operation
            WHERE scope_operation.company_id = ${companyId} AND scope_operation.issue_id = scope_issue.id
              AND ${activityLog.entityType} = 'workspace_operation' AND ${activityLog.entityId} = scope_operation.id::text))
    )
    OR EXISTS (SELECT 1 FROM routines AS scope_routine
      WHERE scope_routine.company_id = ${companyId} AND scope_routine.project_id = ${projectId}
        AND ${activityLog.entityType} = 'routine' AND ${activityLog.entityId} = scope_routine.id::text)
    OR EXISTS (SELECT 1 FROM project_goals AS scope_goal
      WHERE scope_goal.company_id = ${companyId} AND scope_goal.project_id = ${projectId}
        AND ${activityLog.entityType} = 'goal' AND ${activityLog.entityId} = scope_goal.goal_id::text)
    OR EXISTS (SELECT 1 FROM projects AS scope_project
      WHERE scope_project.company_id = ${companyId} AND scope_project.id = ${projectId}
        AND ${activityLog.entityType} = 'goal' AND ${activityLog.entityId} = scope_project.goal_id::text)
    OR EXISTS (SELECT 1 FROM project_workspaces AS scope_workspace
      WHERE scope_workspace.company_id = ${companyId} AND scope_workspace.project_id = ${projectId}
        AND ${activityLog.entityType} = 'project_workspace' AND ${activityLog.entityId} = scope_workspace.id::text)
    OR EXISTS (SELECT 1 FROM heartbeat_runs AS scope_run
      WHERE scope_run.company_id = ${companyId} AND scope_run.id = ${activityLog.runId}
        AND ${projectRunCondition(companyId, projectId, sql`scope_run`)})
  )`;
}
