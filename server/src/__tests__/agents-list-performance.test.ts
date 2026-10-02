import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { agentService } from "../services/agents.js";

function rosterDb() {
  const rows = [
    { id: "worker", companyId: "company-a", name: "Worker", status: "idle", reportsTo: "manager", permissions: {}, spentMonthlyCents: 0 },
    { id: "manager", companyId: "company-a", name: "Manager", status: "terminated", reportsTo: null, permissions: {}, spentMonthlyCents: 0 },
  ];
  const agentPredicates: unknown[][] = [];
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        if (table === agents) {
          agentPredicates.push(new PgDialect().sqlToQuery(condition).params);
          return Promise.resolve(rows);
        }
        return { groupBy: () => Promise.resolve([{ agentId: "worker", spentMonthlyCents: "17" }]) };
      },
    }),
  }));
  return { db: { select } as unknown as Db, select, agentPredicates };
}

describe("agent list read consolidation", () => {
  it("hides terminated agents while retaining their org-chain effect and monthly spend", async () => {
    const mock = rosterDb();
    const result = await agentService(mock.db).list("company-a");
    expect(result.map(({ id }) => id)).toEqual(["worker"]);
    expect(result[0]?.spentMonthlyCents).toBe(17);
    expect(result[0]?.orgChainHealth).toMatchObject({ reason: "terminated_ancestor" });
    expect(mock.agentPredicates).toEqual([["company-a"]]);
    expect(mock.select).toHaveBeenCalledTimes(2);
  });

  it("includes terminated agents when requested without a second roster read", async () => {
    const mock = rosterDb();
    const result = await agentService(mock.db).list("company-a", { includeTerminated: true });
    expect(result.map(({ id }) => id)).toEqual(["worker", "manager"]);
    expect(result[0]?.orgChainHealth).toMatchObject({ reason: "terminated_ancestor" });
    expect(mock.agentPredicates).toEqual([["company-a"]]);
    expect(mock.select).toHaveBeenCalledTimes(2);
  });
});
