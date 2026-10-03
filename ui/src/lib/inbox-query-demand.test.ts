import { describe, expect, it } from "vitest";
import { getInboxQueryDemand } from "./inbox-query-demand";

describe("inbox query demand", () => {
  it("loads one personal issue feed and no company dashboard on mine", () => {
    expect(getInboxQueryDemand("mine", "everything")).toEqual({
      companyIssues: true, mineIssues: true, touchedIssues: false,
      approvals: true, joinRequests: true, dashboard: false, runs: true,
    });
  });
  it.each(["recent", "unread"] as const)("uses touched issues on %s", (tab) => {
    const demand = getInboxQueryDemand(tab, "everything");
    expect(demand.mineIssues).toBe(false);
    expect(demand.touchedIssues).toBe(true);
    expect(demand.dashboard).toBe(false);
  });
  it("defers unrelated feeds in an approvals-only view", () => {
    expect(getInboxQueryDemand("all", "approvals")).toEqual({
      companyIssues: false, mineIssues: false, touchedIssues: false,
      approvals: true, joinRequests: false, dashboard: false, runs: false,
    });
  });
  it("keeps failed runs available to compute accurate company alerts", () => {
    const demand = getInboxQueryDemand("all", "alerts");
    expect(demand.dashboard).toBe(true);
    expect(demand.runs).toBe(true);
    expect(demand.mineIssues).toBe(false);
    expect(demand.touchedIssues).toBe(false);
  });
  it("leaves blocked-view data to its own component", () => {
    expect(Object.values(getInboxQueryDemand("blocked", "everything"))).toEqual(
      Array(7).fill(false),
    );
  });
});
