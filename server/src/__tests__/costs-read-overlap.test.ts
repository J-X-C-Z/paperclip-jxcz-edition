import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import { costService } from "../services/costs.js";

const { attributedCosts } = vi.hoisted(() => ({ attributedCosts: vi.fn() }));
vi.mock("../services/cost-organization.js", () => ({
  attributedCosts,
  organizationCosts: vi.fn(),
  projectCosts: vi.fn(),
}));
vi.mock("../services/budgets.js", () => ({ budgetService: () => ({}) }));

const companyId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const attributed = {
  agentId: "agent-a", provider: "provider-a", model: "model-a", biller: "biller-a",
  billingType: "subscription_included", projectId, projectName: "Project",
  costCents: 13, reportedCostCents: 10, estimatedCostCents: 3, unpricedEventCount: 1,
  inputTokens: 10, cachedInputTokens: 2, outputTokens: 4,
};
const aggregate = { ...attributed, agentName: "Agent", agentAppearance: null, agentStatus: "idle", total: 5 };
const range = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-31T23:59:59Z") };

function fixture(options: { missingCompany?: boolean } = {}) {
  const gate = Promise.withResolvers<unknown[]>();
  const started: string[] = [];
  const predicates: Array<{ table: string; params: unknown[] }> = [];
  const select = vi.fn(() => {
    let table: string;
    const query = {
      from(value: Parameters<typeof getTableName>[0]) { table = getTableName(value); return query; },
      leftJoin() { return query; },
      where(condition: SQL) { predicates.push({ table, params: new PgDialect().sqlToQuery(condition).params }); return query; },
      groupBy() { return query; },
      orderBy() { return query; },
      then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        started.push(table);
        const rows = table === "companies"
          ? Promise.resolve(options.missingCompany ? [] : [{ id: companyId, budgetMonthlyCents: 1000 }])
          : gate.promise;
        return rows.then(resolve, reject);
      },
    };
    return query;
  });
  const db = { select } as unknown as Db;
  return { db, service: costService(db), gate, started, predicates };
}

beforeEach(() => {
  attributedCosts.mockReset().mockResolvedValue([attributed]);
});

describe("cost read overlap", () => {
  it.each(["byAgent", "byAgentModel", "byProvider", "byBiller"] as const)(
    "%s starts reference attribution before the ledger aggregate completes", async (method) => {
      const test = fixture();
      const listing = test.service[method](companyId, range, projectId);
      await vi.waitFor(() => {
        expect(test.started).toEqual(["cost_events"]);
        expect(attributedCosts).toHaveBeenCalledExactlyOnceWith(test.db, companyId, range, projectId);
      });
      test.gate.resolve([aggregate]);
      await expect(listing).resolves.toEqual([expect.objectContaining({
        costCents: 13, reportedCostCents: 10, estimatedCostCents: 3, unpricedEventCount: 1,
      })]);
      const predicate = test.predicates[0];
      expect(predicate?.params).toContain(companyId);
      expect(predicate?.params).toContain(projectId);
      expect(predicate?.params).toContain(range.from.toISOString());
      expect(predicate?.params).toContain(range.to.toISOString());
    },
  );

  it("summary retains the company check and billed/reference cost distinction", async () => {
    const test = fixture();
    const summary = test.service.summary(companyId, range);
    await vi.waitFor(() => {
      expect(test.started).toEqual(["companies", "cost_events"]);
      expect(attributedCosts).toHaveBeenCalledExactlyOnceWith(test.db, companyId, range, undefined);
    });
    test.gate.resolve([aggregate]);
    await expect(summary).resolves.toMatchObject({
      companyId, spendCents: 5, referenceCostCents: 13, reportedCostCents: 10,
      estimatedCostCents: 3, unpricedEventCount: 1, budgetCents: 1000, utilizationPercent: 0.5,
    });
  });

  it("does not read cost data for a missing company", async () => {
    const test = fixture({ missingCompany: true });
    await expect(test.service.summary(companyId, range)).rejects.toMatchObject({ status: 404 });
    expect(test.started).toEqual(["companies"]);
    expect(attributedCosts).not.toHaveBeenCalled();
  });

  it("overlaps reference and aggregate reads within every rolling window", async () => {
    const test = fixture();
    const listing = test.service.windowSpend(companyId, projectId);
    await vi.waitFor(() => {
      expect(test.started).toEqual(["cost_events", "cost_events", "cost_events"]);
      expect(attributedCosts).toHaveBeenCalledTimes(3);
    });
    test.gate.resolve([aggregate]);
    await expect(listing).resolves.toEqual([
      expect.objectContaining({ window: "5h", windowHours: 5, costCents: 13 }),
      expect.objectContaining({ window: "24h", windowHours: 24, costCents: 13 }),
      expect.objectContaining({ window: "7d", windowHours: 168, costCents: 13 }),
    ]);
    for (const [, scope, dates, project] of attributedCosts.mock.calls) {
      expect(scope).toBe(companyId);
      expect(dates.from).toBeInstanceOf(Date);
      expect(project).toBe(projectId);
    }
  });

  it("preserves aggregate errors without replaying a read", async () => {
    const test = fixture();
    const error = new Error("cost aggregate failed");
    const listing = test.service.byBiller(companyId, range, projectId);
    await vi.waitFor(() => expect(test.started).toEqual(["cost_events"]));
    test.gate.reject(error);
    await expect(listing).rejects.toBe(error);
    expect(attributedCosts).toHaveBeenCalledTimes(1);
  });
});
