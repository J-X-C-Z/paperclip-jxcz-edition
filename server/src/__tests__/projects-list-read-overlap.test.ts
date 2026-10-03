import { describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import { budgetPolicies, issues, pluginManagedResources, projectGoals, projects, projectWorkspaces } from "@paperclipai/db";
import { projectService } from "../services/projects.js";

const baseRows = [
  { id: "project-a", companyId: "company-a", name: "First", description: "kept", archivedAt: null, executionWorkspacePolicy: { enabled: true, defaultMode: "isolated" } },
  { id: "project-b", companyId: "company-a", name: "Second", archivedAt: new Date("2026-01-01"), executionWorkspacePolicy: null },
];

function mockDb(options: { empty?: boolean; goals?: Promise<unknown[]>; metricError?: Error } = {}) {
  const started: unknown[] = [];
  const predicates: Array<{ table: unknown; sql: string; params: unknown[] }> = [];
  const select = vi.fn(() => {
    let table: unknown;
    const query = {
      from(value: unknown) { table = value; return query; },
      innerJoin() { return query; },
      where(condition: SQL) {
        const compiled = new PgDialect().sqlToQuery(condition);
        predicates.push({ table, ...compiled });
        return query;
      },
      orderBy() { return query; },
      groupBy() { return query; },
      then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        started.push(table);
        const result = table === projects ? Promise.resolve(options.empty ? [] : baseRows)
          : table === projectGoals ? options.goals ?? Promise.resolve([{ projectId: "project-a", goalId: "goal-a", goalTitle: "Goal" }])
          : table === issues ? options.metricError ? Promise.reject(options.metricError) : Promise.resolve([{ projectId: "project-b", count: 7 }])
          : table === budgetPolicies ? Promise.resolve([{ scopeId: "project-a", amount: 100, windowKind: "lifetime" }])
          : Promise.resolve([]);
        return result.then(resolve, reject);
      },
    };
    return query;
  });
  return { db: { select } as unknown as Db, select, started, predicates };
}

describe("project list read overlap", () => {
  it("starts workspaces, plugin metadata and both metrics before goals complete and preserves fields, ordering and defaults", async () => {
    const goals = Promise.withResolvers<unknown[]>();
    const mock = mockDb({ goals: goals.promise });
    const listing = projectService(mock.db).list("company-a");
    await vi.waitFor(() => {
      expect(mock.started).toContain(issues);
      expect(mock.started).toContain(budgetPolicies);
      expect(mock.started).toContain(projectWorkspaces);
      expect(mock.started).toContain(pluginManagedResources);
    });
    expect(mock.started).toContain(projectGoals);
    goals.resolve([{ projectId: "project-a", goalId: "goal-a", goalTitle: "Goal" }]);
    const result = await listing;
    expect(result.map(({ id }) => id)).toEqual(["project-a", "project-b"]);
    expect(result[0]).toMatchObject({
      description: "kept", goalIds: ["goal-a"], goals: [{ id: "goal-a", title: "Goal" }],
      executionWorkspacePolicy: { enabled: true, defaultMode: "isolated_workspace" },
      workspaces: [], primaryWorkspace: null, managedByPlugin: null, taskCount: 0,
      budget: { amountCents: 100, windowKind: "lifetime" },
    });
    expect(result[0]?.codebase.origin).toBe("managed_checkout");
    expect(result[1]).toMatchObject({ archivedAt: baseRows[1]?.archivedAt, goalIds: [], goals: [], executionWorkspacePolicy: null, taskCount: 7, budget: null });
    const basePredicate = mock.predicates.find(({ table }) => table === projects);
    expect(basePredicate?.params).toEqual(["company-a"]);
    expect(basePredicate?.sql).not.toContain("archived_at");
    for (const table of [issues, budgetPolicies]) {
      const predicate = mock.predicates.find((entry) => entry.table === table);
      expect(predicate?.params).toContain("company-a");
      expect(predicate?.params).toContain("project-a");
      expect(predicate?.params).toContain("project-b");
    }
  });

  it("keeps the explicit active-only company filter", async () => {
    const mock = mockDb();
    await projectService(mock.db).list("company-a", { includeArchived: false });
    const predicate = mock.predicates.find(({ table }) => table === projects);
    expect(predicate?.params).toEqual(["company-a"]);
    expect(predicate?.sql).toContain('"archived_at" is null');
  });

  it("performs no metadata or aggregate reads for an empty company list", async () => {
    const mock = mockDb({ empty: true });
    expect(await projectService(mock.db).list("company-a")).toEqual([]);
    expect(mock.started).toEqual([projects]);
    expect(mock.select).toHaveBeenCalledTimes(1);
  });

  it("rejects the list when a metric read fails", async () => {
    const error = new Error("aggregate failed");
    const mock = mockDb({ metricError: error });
    await expect(projectService(mock.db).list("company-a")).rejects.toBe(error);
  });
});
