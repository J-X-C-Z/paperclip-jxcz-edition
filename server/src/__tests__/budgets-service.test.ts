import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agents,
  approvals,
  budgetIncidents,
  budgetPolicies,
  companies,
  costEvents,
  createDb,
  projects,
} from "@paperclipai/db";
import { budgetService } from "../services/budgets.ts";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

// Budget behavior is exercised against PostgreSQL below and in
// cost-accounting-reliability.test.ts, including transaction and retry paths.

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("budgetService release gate enforcement", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-budgets-service-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(budgetIncidents);
    await db.delete(approvals);
    await db.delete(budgetPolicies);
    await db.delete(costEvents);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(companies);
    mockLogActivity.mockClear();
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createBudgetFixture() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const projectId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `B${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Budget Agent SECRET_TOKEN_SHOULD_NOT_LEAK",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Budget Project",
      status: "in_progress",
    });

    return { companyId, agentId, projectId };
  }

  async function insertCostEvent(input: {
    companyId: string;
    agentId: string;
    projectId?: string | null;
    costCents: number;
    occurredAt?: Date;
  }) {
    const [event] = await db
      .insert(costEvents)
      .values({
        companyId: input.companyId,
        agentId: input.agentId,
        projectId: input.projectId ?? null,
        provider: "openai",
        biller: "openai",
        billingType: "metered_api",
        model: "gpt-5-release-gate",
        inputTokens: 100,
        cachedInputTokens: 10,
        outputTokens: 20,
        costCents: input.costCents,
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning();

    return event!;
  }

  it("batches overview reads while preserving scope, UTC boundaries, inactive totals and open incidents", async () => {
    const { companyId, agentId, projectId } = await createBudgetFixture();
    const foreign = await createBudgetFixture();
    const secondAgentId = randomUUID();
    const emptyProjectId = randomUUID();
    await db.insert(agents).values({
      id: secondAgentId, companyId, name: "Second agent", role: "engineer",
      adapterType: "codex_local", status: "active",
    });
    await db.insert(projects).values({ id: emptyProjectId, companyId, name: "  ", status: "in_progress" });
    const now = new Date("2026-08-15T12:00:00.000Z");
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-09-01T00:00:00.000Z");
    const pauseAt = now;
    await db.update(companies).set({ status: "active", pausedAt: pauseAt, pauseReason: "manual" }).where(eq(companies.id, companyId));
    await db.update(agents).set({ status: "paused", pauseReason: "budget", pausedAt: pauseAt }).where(eq(agents.id, agentId));
    await db.update(projects).set({ pausedAt: pauseAt, pauseReason: "manual" }).where(eq(projects.id, projectId));
    for (const [costCents, occurredAt] of [
      [7, "1969-12-31T23:59:59.999Z"],
      [11, "2026-07-31T23:59:59.999Z"],
      [20, "2026-08-01T00:00:00.000Z"],
      [30, "2026-08-31T23:59:59.999Z"],
      [13, "2026-09-01T00:00:00.000Z"],
    ] as const) {
      await insertCostEvent({ companyId, agentId, projectId, costCents, occurredAt: new Date(occurredAt) });
    }
    await insertCostEvent({ companyId, agentId: secondAgentId, costCents: 40, occurredAt: now });
    await insertCostEvent({ companyId: foreign.companyId, agentId: foreign.agentId, projectId: foreign.projectId, costCents: 999, occurredAt: now });
    const [companyMonth, companyLifetime, agentMonth, projectLifetime, inactiveProject, otherMetric, emptyProject] = await db
      .insert(budgetPolicies).values([
        { companyId, scopeType: "company", scopeId: companyId, windowKind: "calendar_month_utc", amount: 100 },
        { companyId, scopeType: "company", scopeId: companyId, windowKind: "lifetime", amount: 200 },
        { companyId, scopeType: "agent", scopeId: agentId, windowKind: "calendar_month_utc", amount: 100 },
        { companyId, scopeType: "project", scopeId: projectId, windowKind: "lifetime", amount: 70 },
        { companyId, scopeType: "project", scopeId: projectId, windowKind: "calendar_month_utc", amount: 100, isActive: false },
        { companyId, scopeType: "company", scopeId: companyId, metric: "unsupported_metric", windowKind: "calendar_month_utc", amount: 100 },
        { companyId, scopeType: "project", scopeId: emptyProjectId, windowKind: "lifetime", amount: 70 },
      ]).returning();
    const [foreignPolicy] = await db.insert(budgetPolicies).values({
      companyId: foreign.companyId, scopeType: "company", scopeId: foreign.companyId,
      windowKind: "calendar_month_utc", amount: 100,
    }).returning();
    const [pendingApproval] = await db.insert(approvals).values({ companyId,
      type: "budget_override_required", status: "pending", payload: {} }).returning();
    const [agentIncident, incidentOnlyScope, resolvedIncident, foreignIncident] = await db.insert(budgetIncidents).values([
      { companyId, policyId: agentMonth!.id, scopeType: "agent", scopeId: agentId,
        metric: "billed_cents", windowKind: "calendar_month_utc", windowStart: start, windowEnd: end,
        thresholdType: "hard", amountLimit: 100, amountObserved: 150, approvalId: pendingApproval!.id },
      { companyId, policyId: companyLifetime!.id, scopeType: "agent", scopeId: secondAgentId,
        metric: "billed_cents", windowKind: "calendar_month_utc", windowStart: start, windowEnd: end,
        thresholdType: "soft", amountLimit: 200, amountObserved: 45 },
      { companyId, policyId: inactiveProject!.id, scopeType: "project", scopeId: projectId,
        metric: "billed_cents", windowKind: "calendar_month_utc", windowStart: start, windowEnd: end,
        thresholdType: "soft", amountLimit: 100, amountObserved: 90, status: "resolved" },
      { companyId: foreign.companyId, policyId: foreignPolicy!.id, scopeType: "company", scopeId: foreign.companyId,
        metric: "billed_cents", windowKind: "calendar_month_utc", windowStart: start, windowEnd: end,
        thresholdType: "hard", amountLimit: 100, amountObserved: 999 },
    ]).returning();

    const select = vi.spyOn(db, "select");
    const execute = vi.spyOn(db, "execute");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      const overview = await budgetService(db).overview(companyId);
      const policies = new Map(overview.policies.map((policy) => [policy.policyId, policy]));
      expect(select).toHaveBeenCalledTimes(8); // lists, scope batches, approvals, ledger and pending receipts
      expect(execute).not.toHaveBeenCalled(); // shared accounting totals use batched Drizzle queries
      expect(overview.policies).toHaveLength(7);
      expect(policies.get(companyMonth!.id)).toMatchObject({ observedAmount: 90, status: "warning",
        paused: true, pauseReason: "manual", windowStart: start, windowEnd: end });
      expect(policies.get(companyLifetime!.id)).toMatchObject({ observedAmount: 121 });
      expect(policies.get(agentMonth!.id)).toMatchObject({ observedAmount: 50, paused: true, pauseReason: "budget" });
      expect(policies.get(projectLifetime!.id)).toMatchObject({ observedAmount: 81, status: "hard_stop",
        paused: true, pauseReason: "manual", remainingAmount: 0 });
      expect(policies.get(inactiveProject!.id)).toMatchObject({ observedAmount: 50, amount: 0, remainingAmount: 0,
        utilizationPercent: 0, isActive: false, status: "ok" });
      expect(policies.get(otherMetric!.id)).toMatchObject({ observedAmount: 0, status: "ok" });
      expect(policies.get(emptyProject!.id)).toMatchObject({ observedAmount: 0, scopeName: "project",
        paused: false, pauseReason: null });
      expect(overview.activeIncidents).toHaveLength(2);
      expect(overview.activeIncidents).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: agentIncident!.id, companyId,
          scopeName: "Budget Agent SECRET_TOKEN_SHOULD_NOT_LEAK", amountObserved: 150, approvalStatus: "pending" }),
        expect.objectContaining({ id: incidentOnlyScope!.id, companyId,
          scopeName: "Second agent", amountObserved: 45, approvalStatus: null }),
      ]));
      expect(overview.activeIncidents.map((incident) => incident.id)).not.toContain(resolvedIncident!.id);
      expect(overview.activeIncidents.map((incident) => incident.id)).not.toContain(foreignIncident!.id);
      expect(overview).toMatchObject({ pausedAgentCount: 1, pausedProjectCount: 1, pendingApprovalCount: 1 });
      // A second request must observe current ledger/state, with no cached costs.
      await insertCostEvent({ companyId, agentId, projectId, costCents: 5, occurredAt: now });
      await db.update(agents).set({ status: "active", pauseReason: null }).where(eq(agents.id, agentId));
      const refreshed = await budgetService(db).overview(companyId);
      expect(refreshed.policies.find((policy) => policy.policyId === agentMonth!.id))
        .toMatchObject({ observedAmount: 55, paused: false, pauseReason: null });
    } finally {
      vi.useRealTimers();
      select.mockRestore();
      execute.mockRestore();
    }
  });

  it("returns an empty overview without extra scope or spend queries", async () => {
    const { companyId } = await createBudgetFixture();
    const select = vi.spyOn(db, "select");
    const execute = vi.spyOn(db, "execute");
    try {
      await expect(budgetService(db).overview(companyId)).resolves.toEqual({
        companyId, policies: [], activeIncidents: [], pausedAgentCount: 0, pausedProjectCount: 0, pendingApprovalCount: 0,
      });
      expect(select).toHaveBeenCalledTimes(2);
      expect(execute).not.toHaveBeenCalled();
    } finally { select.mockRestore(); execute.mockRestore(); }
  });

  it("raises one soft incident per window before hard-stopping and safely logging agent telemetry", async () => {
    const { companyId, agentId } = await createBudgetFixture();
    const cancelWorkForScope = vi.fn().mockResolvedValue(undefined);
    const service = budgetService(db, { cancelWorkForScope });
    const [policy] = await db
      .insert(budgetPolicies)
      .values({
        companyId,
        scopeType: "agent",
        scopeId: agentId,
        metric: "billed_cents",
        windowKind: "calendar_month_utc",
        amount: 100,
        warnPercent: 80,
        hardStopEnabled: true,
        notifyEnabled: true,
        isActive: true,
      })
      .returning();

    const softEvent = await insertCostEvent({ companyId, agentId, costCents: 80 });
    await service.evaluateCostEvent(softEvent);
    await service.evaluateCostEvent(softEvent);

    let incidentRows = await db
      .select()
      .from(budgetIncidents);
    expect(incidentRows.filter((incident) => incident.thresholdType === "soft")).toHaveLength(1);
    expect(incidentRows[0]).toMatchObject({
      companyId,
      policyId: policy!.id,
      scopeType: "agent",
      scopeId: agentId,
      thresholdType: "soft",
      amountLimit: 100,
      amountObserved: 80,
      approvalId: null,
      status: "open",
    });

    const [agentBeforeHardStop] = await db
      .select({ status: agents.status, pauseReason: agents.pauseReason })
      .from(agents);
    expect(agentBeforeHardStop).toEqual({ status: "active", pauseReason: null });

    const hardEvent = await insertCostEvent({ companyId, agentId, costCents: 25 });
    await service.evaluateCostEvent(hardEvent);
    await service.evaluateCostEvent(hardEvent);

    incidentRows = await db
      .select()
      .from(budgetIncidents);
    expect(incidentRows.filter((incident) => incident.thresholdType === "soft")).toHaveLength(1);
    expect(incidentRows.filter((incident) => incident.thresholdType === "hard")).toHaveLength(1);
    expect(incidentRows.find((incident) => incident.thresholdType === "soft")).toMatchObject({
      status: "resolved",
    });
    expect(incidentRows.find((incident) => incident.thresholdType === "hard")).toMatchObject({
      amountLimit: 100,
      amountObserved: 105,
      status: "open",
    });

    const [approval] = await db.select().from(approvals);
    expect(approval).toMatchObject({
      companyId,
      type: "budget_override_required",
      status: "pending",
    });

    const [agentAfterHardStop] = await db
      .select({ status: agents.status, pauseReason: agents.pauseReason, pausedAt: agents.pausedAt })
      .from(agents);
    expect(agentAfterHardStop).toMatchObject({ status: "paused", pauseReason: "budget" });
    expect(agentAfterHardStop?.pausedAt).toBeInstanceOf(Date);
    expect(cancelWorkForScope).toHaveBeenCalledTimes(2);
    expect(cancelWorkForScope).toHaveBeenCalledWith({ companyId, scopeType: "agent", scopeId: agentId, createdBefore: expect.any(Date), enforcement: { policyId: expect.any(String), version: expect.any(Number) } });

    const block = await service.getInvocationBlock(companyId, agentId);
    expect(block).toEqual({
      scopeType: "agent",
      scopeId: agentId,
      scopeName: "Budget Agent SECRET_TOKEN_SHOULD_NOT_LEAK",
      reason: "Agent is paused because its budget hard-stop was reached.",
    });

    const telemetryCalls = mockLogActivity.mock.calls.map(([, input]) => input);
    expect(telemetryCalls.filter((call) => call.action === "budget.soft_threshold_crossed")).toHaveLength(1);
    expect(telemetryCalls.filter((call) => call.action === "budget.hard_threshold_crossed")).toHaveLength(1);
    expect(telemetryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "budget.soft_threshold_crossed",
          entityType: "budget_incident",
          details: expect.objectContaining({
            scopeType: "agent",
            scopeId: agentId,
            amountObserved: 80,
            amountLimit: 100,
          }),
        }),
        expect.objectContaining({
          action: "budget.hard_threshold_crossed",
          entityType: "budget_incident",
          details: expect.objectContaining({
            scopeType: "agent",
            scopeId: agentId,
            amountObserved: 105,
            amountLimit: 100,
            approvalId: approval!.id,
          }),
        }),
      ]),
    );
    for (const call of telemetryCalls) {
      expect(JSON.stringify(call.details)).not.toContain("SECRET_TOKEN_SHOULD_NOT_LEAK");
      expect(call.details).not.toHaveProperty("prompt");
      expect(call.details).not.toHaveProperty("message");
    }
  });

  it("distinguishes a company budget pause from a manual company pause", async () => {
    const { companyId, agentId } = await createBudgetFixture();
    const service = budgetService(db);
    await db.update(companies).set({ status: "paused", pauseReason: "budget" }).where(eq(companies.id, companyId));
    expect(await service.getInvocationBlock(companyId, agentId)).toMatchObject({
      scopeType: "company",
      scopeId: companyId,
      reason: "Budget pause requires a policy or an explicit operator resume.",
    });
    await db.update(companies).set({ pauseReason: null }).where(eq(companies.id, companyId));
    expect(await service.getInvocationBlock(companyId, agentId)).toMatchObject({
      scopeType: "company",
      scopeId: companyId,
      reason: "Company is paused and cannot start new work.",
    });
  });

  it("hard-stops project work until a valid budget raise resumes it and overview reconciles ledger spend", async () => {
    const { companyId, agentId, projectId } = await createBudgetFixture();
    const cancelWorkForScope = vi.fn().mockResolvedValue(undefined);
    const service = budgetService(db, { cancelWorkForScope });
    await db.insert(budgetPolicies).values({
      companyId,
      scopeType: "project",
      scopeId: projectId,
      metric: "billed_cents",
      windowKind: "lifetime",
      amount: 100,
      warnPercent: 75,
      hardStopEnabled: true,
      notifyEnabled: true,
      isActive: true,
    });

    const event = await insertCostEvent({ companyId, agentId, projectId, costCents: 125 });
    await service.evaluateCostEvent(event);
    await service.evaluateCostEvent(event);

    const incidentRows = await db
      .select()
      .from(budgetIncidents);
    expect(incidentRows.filter((incident) => incident.thresholdType === "hard")).toHaveLength(1);
    const hardIncident = incidentRows.find((incident) => incident.thresholdType === "hard")!;
    expect(hardIncident).toMatchObject({
      companyId,
      scopeType: "project",
      scopeId: projectId,
      amountLimit: 100,
      amountObserved: 125,
      status: "open",
    });

    const [projectAfterHardStop] = await db
      .select({ pauseReason: projects.pauseReason, pausedAt: projects.pausedAt })
      .from(projects);
    expect(projectAfterHardStop?.pauseReason).toBe("budget");
    expect(projectAfterHardStop?.pausedAt).toBeInstanceOf(Date);
    expect(cancelWorkForScope).toHaveBeenCalledWith({ companyId, scopeType: "project", scopeId: projectId, createdBefore: expect.any(Date), enforcement: { policyId: expect.any(String), version: expect.any(Number) } });

    const overviewWhileBlocked = await service.overview(companyId);
    expect(overviewWhileBlocked.pausedProjectCount).toBe(1);
    expect(overviewWhileBlocked.pendingApprovalCount).toBe(1);
    expect(overviewWhileBlocked.policies[0]).toMatchObject({
      scopeType: "project",
      scopeId: projectId,
      amount: 100,
      observedAmount: 125,
      remainingAmount: 0,
      utilizationPercent: 125,
      status: "hard_stop",
      paused: true,
      pauseReason: "budget",
    });
    expect(overviewWhileBlocked.activeIncidents).toHaveLength(1);

    await expect(
      service.resolveIncident(
        companyId,
        hardIncident.id,
        { action: "raise_budget_and_resume", amount: 125 },
        "board-user",
      ),
    ).rejects.toThrow("New budget must exceed current observed spend");

    expect(await service.getInvocationBlock(companyId, agentId, { projectId })).toEqual({
      scopeType: "project",
      scopeId: projectId,
      scopeName: "Budget Project",
      reason: "Project cannot start work because its budget hard-stop is still exceeded.",
    });

    const resolved = await service.resolveIncident(
      companyId,
      hardIncident.id,
      { action: "raise_budget_and_resume", amount: 175, decisionNote: "Approved release-gate budget raise." },
      "board-user",
    );
    expect(resolved).toMatchObject({ status: "resolved", approvalStatus: "approved" });

    const [projectAfterResume] = await db
      .select({ pauseReason: projects.pauseReason, pausedAt: projects.pausedAt })
      .from(projects);
    expect(projectAfterResume).toEqual({ pauseReason: null, pausedAt: null });
    expect(await service.getInvocationBlock(companyId, agentId, { projectId })).toBeNull();

    const overviewAfterResume = await service.overview(companyId);
    expect(overviewAfterResume.pausedProjectCount).toBe(0);
    expect(overviewAfterResume.pendingApprovalCount).toBe(0);
    expect(overviewAfterResume.policies[0]).toMatchObject({
      scopeType: "project",
      scopeId: projectId,
      amount: 175,
      observedAmount: 125,
      remainingAmount: 50,
      utilizationPercent: expect.closeTo(71.43, 2),
      status: "ok",
      paused: false,
      pauseReason: null,
    });
    expect(overviewAfterResume.activeIncidents).toHaveLength(0);
  });
});
