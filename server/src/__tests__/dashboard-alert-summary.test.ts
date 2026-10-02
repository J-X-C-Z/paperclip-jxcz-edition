import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import { agents, companies, costEvents } from "@paperclipai/db";
import { dashboardService } from "../services/dashboard.js";

function mockDb(budget: number | null, spend = 0, errors = 0) {
  const predicates: Array<{ table: unknown; params: unknown[] }> = [];
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        predicates.push({ table, params: new PgDialect().sqlToQuery(condition).params });
        return Promise.resolve(table === companies
          ? budget === null ? [] : [{ budgetMonthlyCents: budget }]
          : table === agents ? [{ count: String(errors) }] : [{ monthSpend: String(spend) }]);
      },
    }),
  }));
  return { db: { select } as unknown as Db, select, predicates };
}

describe("dashboard alert summary", () => {
  it("reads only alert inputs with company predicates and UTC month bounds", async () => {
    const mock = mockDb(100_000, 79_995, 2);
    const result = await dashboardService(mock.db).alertSummary("company-a");
    expect(result).toEqual({
      agents: { error: 2 },
      costs: { monthSpendCents: 79_995, monthBudgetCents: 100_000, monthUtilizationPercent: 80 },
    });
    expect(mock.select).toHaveBeenCalledTimes(3);
    expect(mock.predicates.map(({ table }) => table)).toEqual([companies, agents, costEvents]);
    expect(mock.predicates[0]?.params).toEqual(["company-a"]);
    expect(mock.predicates[1]?.params).toEqual(["company-a", "error"]);
    expect(mock.predicates[2]?.params[0]).toBe("company-a");
    const date = new Date(String(mock.predicates[2]?.params[1]));
    expect(date.getUTCDate()).toBe(1);
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });

  it("keeps utilization zero for an unset budget", async () => {
    const mock = mockDb(0, 123, 0);
    expect((await dashboardService(mock.db).alertSummary("company-a")).costs.monthUtilizationPercent).toBe(0);
  });

  it("stops before aggregate reads when the company does not exist", async () => {
    const mock = mockDb(null);
    await expect(dashboardService(mock.db).alertSummary("missing")).rejects.toThrow("Company not found");
    expect(mock.select).toHaveBeenCalledTimes(1);
  });
});
