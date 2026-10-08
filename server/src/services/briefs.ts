import { and, desc, eq } from "drizzle-orm";
import { agents, briefs, briefSettings, projects, issues, type Db } from "@paperclipai/db";
import type { CreateBrief } from "@paperclipai/shared";
import { conflict, forbidden, notFound } from "../errors.js";
import { builtInAgentService } from "./built-in-agents.js";
import { issueService } from "./issues.js";
import { heartbeatService } from "./heartbeat.js";

export function briefGenerationInstructions(companyId: string, projectId?: string | null) {
  return [
    "生成一份简洁、可核验的中文工作简报。先读取当前公司的项目、任务、相关评论与运行记录，明确已完成、进行中、阻塞和需要用户决策的事项。不要把运行中或构建通过误写成已验收。",
    `公司 ID: ${companyId}。${projectId ? `仅汇报项目 ${projectId}。` : "汇报当前公司。"}所有读取和引用必须属于此公司。`,
    "不要修改源码、业务任务或代理配置。简报内容必须来自实际读取的证据；sourceRefs 至少包含一个公司内任务或项目的可访问引用。",
    `完成后使用本次运行的 PAPERCLIP_API_URL 和 PAPERCLIP_API_KEY，POST /api/companies/${companyId}/briefs，JSON: {title,body,sourceRefs,projectId,issueId:当前任务ID,status:\"published\"}。body 是 Markdown，projectId ${projectId ? `为 \"${projectId}\"` : "为 null"}。`,
    "这是系统级数据库投送，不调用旧简报插件。服务端根据你的认证身份记录作者，不提交 authorAgentId。必须确认接口返回 201 与简报 id，并重新 GET 同一简报列表核验投送成功，再在本任务中汇报简报 id 并完成任务。失败必须报告真实原因，不得声称已投送。",
  ].join("\n\n");
}

export function briefService(db: Db) {
  async function assertProject(companyId: string, projectId?: string | null) {
    if (!projectId) return;
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
    if (!project) throw notFound("Project not found");
  }
  async function settings(companyId: string) {
    const [configured] = await db.select().from(briefSettings).where(eq(briefSettings.companyId, companyId));
    const agentId = configured?.secretaryAgentId ?? (await builtInAgentService(db).get(companyId, "briefs")).agentId;
    const [agent] = agentId ? await db.select({ id: agents.id, name: agents.name, status: agents.status }).from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId))) : [];
    return { secretaryAgentId: agent?.id ?? null, secretaryAgent: agent ?? null, enabled: Boolean(agent && ["idle", "running", "error"].includes(agent.status)) };
  }
  return {
    settings,
    assertProject,
    updateSettings: async (companyId: string, secretaryAgentId: string | null) => {
      if (secretaryAgentId) {
        const [agent] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, secretaryAgentId), eq(agents.companyId, companyId)));
        if (!agent) throw notFound("Secretary agent not found");
      }
      await db.insert(briefSettings).values({ companyId, secretaryAgentId }).onConflictDoUpdate({ target: briefSettings.companyId, set: { secretaryAgentId, updatedAt: new Date() } });
      return settings(companyId);
    },
    list: async (companyId: string, projectId?: string | null) => {
      await assertProject(companyId, projectId);
      return db.select().from(briefs).where(and(eq(briefs.companyId, companyId), projectId ? eq(briefs.projectId, projectId) : undefined)).orderBy(desc(briefs.createdAt)).limit(100);
    },
    create: async (companyId: string, authorAgentId: string, input: CreateBrief) => {
      await assertProject(companyId, input.projectId);
      const current = await settings(companyId);
      if (!current.enabled || current.secretaryAgentId !== authorAgentId) throw forbidden("Only the configured briefs secretary can publish briefs");
      if (input.issueId) {
        const [issue] = await db.select({ id: issues.id, assigneeAgentId: issues.assigneeAgentId, projectId: issues.projectId }).from(issues).where(and(eq(issues.id, input.issueId), eq(issues.companyId, companyId)));
        if (!issue) throw notFound("Source issue not found");
        if (issue.assigneeAgentId !== authorAgentId) throw forbidden("Secretary must be assigned to the source issue");
        if (input.projectId && issue.projectId !== input.projectId) throw conflict("Brief project must match its source issue");
      }
      const [brief] = await db.insert(briefs).values({ ...input, companyId, authorAgentId, authorAgentName: current.secretaryAgent!.name }).onConflictDoNothing({ target: briefs.issueId }).returning();
      if (brief) return brief;
      const [existing] = await db.select().from(briefs).where(and(eq(briefs.companyId, companyId), eq(briefs.issueId, input.issueId!)));
      if (!existing) throw conflict("Brief submission could not be persisted");
      return existing;
    },
    generate: async (companyId: string, projectId: string | null | undefined, userId: string | null) => {
      await assertProject(companyId, projectId);
      const current = await settings(companyId);
      if (!current.enabled || !current.secretaryAgentId) throw conflict("Configure an active briefs secretary before generating a brief");
      const issue = await issueService(db).create(companyId, {
        title: "生成并投送工作简报",
        description: briefGenerationInstructions(companyId, projectId),
        projectId: projectId ?? null,
        assigneeAgentId: current.secretaryAgentId,
        status: "todo", priority: "medium", createdByUserId: userId,
        allowDuplicate: true,
      });
      const run = await heartbeatService(db).wakeup(current.secretaryAgentId, {
        source: "on_demand", triggerDetail: "manual", reason: "issue_assigned",
        requestedByActorType: "user", requestedByActorId: userId ?? undefined,
        payload: { issueId: issue.id }, contextSnapshot: { issueId: issue.id, taskId: issue.id, taskKey: issue.id },
        idempotencyKey: `brief-generation:${issue.id}`,
      });
      return { issueId: issue.id, status: "queued" as const, runId: run?.id ?? null };
    },
  };
}
