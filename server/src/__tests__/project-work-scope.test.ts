import express from "express";
import request from "supertest";
import { errorHandler } from "../middleware/error-handler.js";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityLog, agents, companies, costEvents, createDb, goals, heartbeatRuns, issues, projectAgentMemberships, projectGoals, projects } from "@paperclipai/db";
import { createGoalSchema, updateGoalSchema } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { activityService } from "../services/activity.js";
import { agentActionAuditService } from "../services/agent-action-audit.js";
import { costService } from "../services/costs.js";
import { dashboardService } from "../services/dashboard.js";
import { goalService } from "../services/goals.js";
import { projectRunCondition, resolveProjectScope } from "../services/project-scope.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDb = support.supported ? describe : describe.skip;
if (!support.supported) console.warn(`Project scope database tests unavailable: ${support.reason}`);

describe("project goal contract", () => {
  it("accepts creation attribution without exposing relation changes in generic updates", () => {
    const projectId = randomUUID();
    expect(createGoalSchema.parse({ title: "Goal", projectId }).projectId).toBe(projectId);
    expect(updateGoalSchema.parse({ title: "Goal", projectId })).not.toHaveProperty("projectId");
  });
});

describeDb("project work aggregates and attribution", () => {
  let db: ReturnType<typeof createDb>;
  let temp: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const foreignProjectId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const issueId = randomUUID();
  const otherIssueId = randomUUID();
  const runId = randomUUID();
  const otherRunId = randomUUID();
  const unscopedRunId = randomUUID();

  beforeAll(async () => {
    temp = await startEmbeddedPostgresTestDatabase("paperclip-project-work-");
    db = createDb(temp.connectionString);
    await db.insert(companies).values([
      { id: companyId, name: "Scoped", issuePrefix: "SCOPE", budgetMonthlyCents: 9999 },
      { id: otherCompanyId, name: "Foreign", issuePrefix: "FOREIGN" },
    ]);
    await db.insert(projects).values([
      { id: projectId, companyId, name: "Selected" }, { id: otherProjectId, companyId, name: "Sibling" },
      { id: foreignProjectId, companyId: otherCompanyId, name: "Foreign" },
    ]);
    await db.insert(agents).values([
      { id: memberId, companyId, name: "Member", role: "engineer", status: "idle", adapterType: "process" },
      { id: outsiderId, companyId, name: "Legacy assignee", role: "engineer", status: "paused", adapterType: "process" },
    ]);
    await db.insert(projectAgentMemberships).values({ companyId, projectId, agentId: memberId });
    await db.insert(issues).values([
      { id: issueId, companyId, projectId, title: "Selected task", status: "in_progress", assigneeAgentId: outsiderId },
      { id: otherIssueId, companyId, projectId: otherProjectId, title: "Sibling task", status: "blocked", assigneeAgentId: memberId },
    ]);
    await db.insert(heartbeatRuns).values([
      { id: runId, companyId, agentId: outsiderId, status: "succeeded", contextSnapshot: { issueId } },
      { id: otherRunId, companyId, agentId: memberId, status: "failed", contextSnapshot: { issueId: otherIssueId } },
      { id: unscopedRunId, companyId, agentId: memberId, status: "running" },
    ]);
    await db.insert(costEvents).values([
      { companyId, agentId: outsiderId, projectId, provider: "p", model: "m", costCents: 123, occurredAt: new Date() },
      { companyId, agentId: memberId, projectId: otherProjectId, provider: "p", model: "m", costCents: 456, occurredAt: new Date() },
      { companyId, agentId: memberId, provider: "p", model: "m", costCents: 789, occurredAt: new Date() },
    ]);
    await db.insert(activityLog).values([
      { companyId, actorType: "agent", actorId: outsiderId, agentId: outsiderId, action: "issue.updated", entityType: "issue", entityId: issueId },
      { companyId, actorType: "system", actorId: "system", action: "project.updated", entityType: "project", entityId: projectId },
      { companyId, actorType: "agent", actorId: outsiderId, agentId: outsiderId, runId, action: "agent.ran", entityType: "agent", entityId: outsiderId },
      { companyId, actorType: "agent", actorId: memberId, agentId: memberId, action: "agent.updated", entityType: "agent", entityId: memberId },
      { companyId, actorType: "agent", actorId: memberId, agentId: memberId, runId: otherRunId, action: "issue.updated", entityType: "issue", entityId: otherIssueId },
    ]);
  }, 90000);
  afterAll(async () => { await temp?.cleanup(); });

  it("validates scope against company and rejects malformed identifiers", async () => {
    expect(await resolveProjectScope(db, companyId, projectId)).toBe(projectId);
    expect(await resolveProjectScope(db, companyId, undefined)).toBeUndefined();
    await expect(resolveProjectScope(db, companyId, foreignProjectId)).rejects.toMatchObject({ status: 404 });
    await expect(resolveProjectScope(db, companyId, [projectId])).rejects.toMatchObject({ status: 400 });
  });

  it("counts members, project tasks and attributable runs independently", async () => {
    const summary = await dashboardService(db).summary(companyId, projectId);
    expect(summary.agents).toEqual({ active: 1, running: 0, paused: 0, error: 0 });
    expect(summary.tasks).toMatchObject({ open: 1, inProgress: 1, blocked: 0 });
    expect(summary.costs).toMatchObject({ monthSpendCents: 123, monthBudgetCents: 0 });
    expect(summary.runActivity.reduce((total, day) => total + day.total, 0)).toBe(1);
    const scopedRuns = await db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(eq(heartbeatRuns.companyId, companyId), projectRunCondition(companyId, projectId)));
    expect(scopedRuns.map(run => run.id)).toEqual([runId]);
  });

  it("filters every cost aggregation by stored project attribution", async () => {
    const service = costService(db);
    expect((await service.summary(companyId, undefined, projectId)).spendCents).toBe(123);
    expect((await service.summary(companyId)).spendCents).toBe(1368);
    for (const method of [service.byAgent, service.byAgentModel, service.byProvider, service.byBiller, service.byProject]) {
      const rows = await method(companyId, undefined, projectId);
      expect(rows.reduce((total, row) => total + Number(row.costCents), 0)).toBe(123);
    }
    const windows = await service.windowSpend(companyId, projectId);
    expect(windows).toHaveLength(3);
    expect(windows.every(row => Number(row.costCents) === 123)).toBe(true);
  });

  it("keeps only provably related activity for JSON and paginated audit", async () => {
    const selected = await activityService(db).list({ companyId, projectId });
    expect(selected).toHaveLength(3);
    expect(selected.some(row => row.entityId === memberId)).toBe(false);
    const audit = agentActionAuditService(db);
    const first = await audit.list({ companyId, projectId, actorScope: "all", limit: 2 });
    const second = await audit.list({ companyId, projectId, actorScope: "all", limit: 2, cursor: first.nextCursor! });
    expect(first.items.length + second.items.length).toBe(3);
    expect(second.nextCursor).toBeNull();
  });

  it("validates scope on dashboard, cost, activity, audit, live run and goal HTTP routes", async () => {
    const [{ dashboardRoutes }, { costRoutes }, { activityRoutes }, { agentRoutes }, { goalRoutes }] = await Promise.all([
      import("../routes/dashboard.js"), import("../routes/costs.js"), import("../routes/activity.js"),
      import("../routes/agents.js"), import("../routes/goals.js"),
    ]);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.actor = { type: "board", source: "local_implicit", userId: "project-scope-test" }; next(); });
    for (const router of [dashboardRoutes(db), costRoutes(db), activityRoutes(db), agentRoutes(db), goalRoutes(db)]) app.use("/api", router);
    app.use(errorHandler);
    const base = `/api/companies/${companyId}`;
    for (const endpoint of ["dashboard", "costs/summary", "activity", "audit/agent-actions", "audit/agent-actions.csv", "live-runs", "goals"]) {
      const missing = await request(app).get(`${base}/${endpoint}`).query({ projectId: foreignProjectId });
      expect(missing.status, endpoint).toBe(404);
      const invalid = await request(app).get(`${base}/${endpoint}`).query({ projectId: "bad-id" });
      expect(invalid.status, endpoint).toBe(400);
    }
    const summary = await request(app).get(`${base}/dashboard`).query({ projectId });
    expect(summary.status).toBe(200);
    expect(summary.body.projectId).toBe(projectId);
    const cost = await request(app).get(`${base}/costs/summary`).query({ projectId });
    expect(cost.body.spendCents).toBe(123);
    const activity = await request(app).get(`${base}/activity`).query({ projectId });
    expect(activity.body).toHaveLength(3);
    const audit = await request(app).get(`${base}/audit/agent-actions`).query({ projectId, actorScope: "all" });
    expect(audit.body.items).toHaveLength(3);
    const csv = await request(app).get(`${base}/audit/agent-actions.csv`).query({ projectId, actorScope: "all" });
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(issueId);
    expect(csv.text).not.toContain(otherIssueId);
    const live = await request(app).get(`${base}/live-runs`).query({ projectId, minCount: 1 });
    expect(live.status).toBe(200);
    expect(live.body.map((run: { id: string }) => run.id)).toEqual([runId]);
    const created = await request(app).post(`${base}/goals`).send({ title: "HTTP selected goal", projectId });
    expect(created.status).toBe(201);
    const goalList = await request(app).get(`${base}/goals`).query({ projectId });
    expect(goalList.body.map((goal: { id: string }) => goal.id)).toContain(created.body.id);
  }, 60000);

  it("creates a linked goal atomically and leaves no goal for a foreign project", async () => {
    const service = goalService(db);
    const goal = await service.create(companyId, { title: "Selected goal", projectId });
    expect(await db.select().from(projectGoals).where(eq(projectGoals.goalId, goal.id))).toMatchObject([{ companyId, projectId, goalId: goal.id }]);
    expect((await service.list(companyId, projectId)).map(row => row.id)).toContain(goal.id);
    await expect(service.create(companyId, { title: "Foreign goal", projectId: foreignProjectId })).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(goals).where(eq(goals.title, "Foreign goal"))).toHaveLength(0);
  });
});
