import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueService } from "../services/issues.js";

const { executionProjectionsForRuns } = vi.hoisted(() => ({ executionProjectionsForRuns: vi.fn() }));
vi.mock("../services/execution-projection.js", () => ({ executionProjectionsForRuns }));

const companyId = "00000000-0000-4000-8000-000000000001";
const issueId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";
const updatedAt = new Date("2026-01-01T00:00:00Z");
const commentAt = new Date("2026-01-02T00:00:00Z");

function fixture(empty = false) {
  const labelsGate = Promise.withResolvers<unknown[]>();
  const started: string[] = [];
  let issueReads = 0;
  const baseIssue = {
    id: issueId, companyId, title: "Review", identifier: "TEST-1", status: "in_review", priority: "medium",
    description: Buffer.from("preserved", "utf8").toString("base64"), parentId: null, assigneeAgentId: null, assigneeUserId: null,
    executionRunId: runId, updatedAt,
  };
  const db = {
    select() {
      let table: string;
      const query = {
        from(value: Parameters<typeof getTableName>[0]) { table = getTableName(value); return query; },
        innerJoin() { return query; }, where() { return query; }, orderBy() { return query; },
        groupBy() { return query; }, limit() { return query; }, offset() { return query; },
        then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
          started.push(table);
          const rows = table === "issues" ? Promise.resolve(issueReads++ === 0 && !empty ? [baseIssue] : [])
            : table === "issue_labels" ? labelsGate.promise
            : table === "heartbeat_runs" ? Promise.resolve([{ id: runId, status: "running", agentId: "agent-a", createdAt: updatedAt }])
            : table === "issue_comments" ? Promise.resolve([{ issueId, latestCommentAt: commentAt }])
            : Promise.resolve([]);
          return rows.then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as Db;
  return { db, labelsGate, started };
}

describe("issue list read overlap", () => {
  it("loads runs, activity and review attention while labels are pending and preserves assembled fields", async () => {
    executionProjectionsForRuns.mockReset().mockResolvedValue(new Map([[runId, { phase: "running" }]]));
    const test = fixture();
    const listing = issueService(test.db).list(companyId);
    await vi.waitFor(() => {
      expect(test.started).toContain("issue_labels");
      expect(test.started).toContain("heartbeat_runs");
      expect(test.started).toContain("issue_comments");
      expect(test.started).toContain("activity_log");
      expect(test.started.filter((table) => table === "issues")).toHaveLength(2);
      expect(executionProjectionsForRuns).toHaveBeenCalledExactlyOnceWith(test.db, companyId, [runId]);
    });
    test.labelsGate.resolve([{ issueId, label: { id: "label-a", name: "Label" } }]);
    await expect(listing).resolves.toEqual([expect.objectContaining({
      id: issueId, companyId, description: "preserved", labelIds: ["label-a"],
      labels: [{ id: "label-a", name: "Label" }], watchdog: null,
      activeRun: expect.objectContaining({ id: runId, execution: { phase: "running" } }),
      lastActivityAt: commentAt, reviewAttention: expect.objectContaining({ state: "none" }),
    })]);
  });

  it("does not perform sidecar reads for an empty result", async () => {
    executionProjectionsForRuns.mockReset();
    const test = fixture(true);
    await expect(issueService(test.db).list(companyId)).resolves.toEqual([]);
    expect(test.started).toEqual(["issues"]);
    expect(executionProjectionsForRuns).not.toHaveBeenCalled();
  });

  it("overlaps blocker graph and scoped liveness reads without changing attention", async () => {
    executionProjectionsForRuns.mockReset();
    const readinessGate = Promise.withResolvers<unknown[]>();
    const wakeGate = Promise.withResolvers<unknown[]>();
    const interactionsGate = Promise.withResolvers<unknown[]>();
    const started: string[] = [];
    let issueReads = 0;
    const baseIssue = {
      id: issueId, companyId, title: "Blocked", identifier: "TEST-1", status: "blocked", priority: "medium",
      description: null, parentId: null, assigneeAgentId: "agent-a", assigneeUserId: null,
      executionRunId: null, updatedAt,
    };
    const db = {
      select(fields?: Record<string, unknown>) {
        let table: string;
        const query = {
          from(value: Parameters<typeof getTableName>[0]) { table = getTableName(value); return query; },
          innerJoin() { return query; }, where() { return query; }, orderBy() { return query; },
          groupBy() { return query; }, limit() { return query; }, offset() { return query; },
          then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
            const readiness = table === "issue_relations" && fields && "blockerStatus" in fields;
            const label = readiness ? "dependency_readiness" : table;
            started.push(label);
            const rows = readiness ? readinessGate.promise
              : table === "issues" ? Promise.resolve(issueReads++ === 0 ? [baseIssue] : [])
              : table === "agent_wakeup_requests" ? wakeGate.promise
              : table === "issue_thread_interactions" ? interactionsGate.promise
              : table === "agents" ? Promise.resolve([{ id: "agent-a", companyId, status: "idle" }])
              : Promise.resolve([]);
            return rows.then(resolve, reject);
          },
        };
        return query;
      },
    } as unknown as Db;
    const listing = issueService(db).list(companyId);
    await vi.waitFor(() => {
      expect(started).toContain("dependency_readiness");
      expect(started).toContain("issue_relations");
      expect(started.filter((table) => table === "issues")).toHaveLength(2);
    });
    readinessGate.resolve([]);
    await vi.waitFor(() => {
      expect(started).toContain("agent_wakeup_requests");
      expect(started).toContain("issue_thread_interactions");
      expect(started).toContain("issue_recovery_actions");
      expect(started).toContain("agents");
    });
    wakeGate.resolve([]);
    interactionsGate.resolve([]);
    await expect(listing).resolves.toEqual([expect.objectContaining({
      id: issueId, status: "blocked", blockerAttention: expect.objectContaining({
        unresolvedBlockerCount: 0, attentionBlockerCount: 0,
      }),
    })]);
  });
});
