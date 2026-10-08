import { describe, expect, it } from "vitest";
import { attributedCosts, aggregateOrganizationCosts, type CostMembership } from "../services/cost-organization.js";

const cost = { agentId: "a", projectId: "p", projectName: "Project", costCents: 30, reportedCostCents: 10, estimatedCostCents: 20, unpricedEventCount: 1, inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 };
const membership: CostMembership = { agentId: "a", teamId: "t", teamName: "Team", projectId: "p", projectName: "Project", departmentId: "d", departmentName: "Department" };

describe("organization cost attribution", () => {
  it("deduplicates repeated membership while preserving actual and estimated amounts", () => {
    const result = aggregateOrganizationCosts([cost], [membership, membership]);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({ teamId: "t", costCents: 30, reportedCostCents: 10, estimatedCostCents: 20 });
    expect(result.departments[0]).toMatchObject({ departmentId: "d", costCents: 30, reportedCostCents: 10, estimatedCostCents: 20, unpricedEventCount: 1 });
  });
  it("keeps ambiguous teams unassigned but credits a common department only once", () => {
    const result = aggregateOrganizationCosts([cost], [membership, { ...membership, teamId: "t2" }]);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({ teamId: null, costCents: 30 });
    expect(result.departments).toHaveLength(1);
    expect(result.departments[0]).toMatchObject({ departmentId: "d", costCents: 30 });
  });
  it("does not assign work in another project or ambiguous departments", () => {
    const result = aggregateOrganizationCosts([cost, { ...cost, projectId: "p2" }], [membership, { ...membership, teamId: "t2", departmentId: "d2" }]);
    expect(result.teams[0]).toMatchObject({ teamId: null, costCents: 60 });
    expect(result.departments[0]).toMatchObject({ departmentId: null, costCents: 60 });
  });
  it("retains all spending when organization tables are unavailable", () => {
    const result = aggregateOrganizationCosts([cost], []);
    expect(result.teams[0]).toMatchObject({ teamId: null, costCents: 30 });
    expect(result.departments[0]).toMatchObject({ departmentId: null, costCents: 30 });
  });
});

describe("read-time token estimates", () => {
  it("separates reported charges, historical estimates, and unknown pricing", async () => {
    const base = { agentId: "a", projectId: "p", projectName: "Project", provider: "openai", model: "gpt-6.1-sol", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, costCents: 0, reportedCostCents: 0, estimatedCostCents: 0, unpricedEventCount: 0 };
    const db = { execute: async () => [
      { ...base, costStatus: "unpriced", billingType: "metered_api" },
      { ...base, costStatus: "reported", billingType: "subscription_included" },
      { ...base, costStatus: "estimated", billingType: "metered_api", costCents: 75, estimatedCostCents: 75 },
      { ...base, model: "unknown", costStatus: "unpriced", billingType: "metered_api" },
      { ...base, costStatus: "reported", billingType: "metered_api", costCents: 120, reportedCostCents: 120 },
    ] };
    const rows = await attributedCosts(db as never, "company");
    expect(rows.map((row) => [row.reportedCostCents, row.estimatedCostCents, row.unpricedEventCount, row.referenceCostCents])).toEqual([
      [0, 200, 0, 200], [0, 200, 0, 200], [0, 75, 0, 75], [0, 0, 1, 0], [120, 0, 0, 120],
    ]);
  });
});


describe("fractional reference costs", () => {
  it("retains tiny subscription runs until the final aggregate", async () => {
    const tiny = { agentId: "a", projectId: null, projectName: null, provider: "openai", model: "gpt-6.1-sol", billingType: "subscription_included", costStatus: "reported", inputTokens: 10, cachedInputTokens: 0, outputTokens: 0, costCents: 0, reportedCostCents: 0 };
    const rows = await attributedCosts({ execute: async () => [tiny, tiny] } as never, "company");
    expect(rows[0].estimatedCostCents).toBeCloseTo(0.002);
    expect(aggregateOrganizationCosts(rows, []).teams[0].referenceCostCents).toBeCloseTo(0.004);
  });
  it("does not add a reference estimate on top of a positive reported subscription charge", async () => {
    const row = { agentId: "a", projectId: null, projectName: null, provider: "openai", model: "gpt-6.1-sol", billingType: "subscription_included", costStatus: "reported", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, costCents: 50, reportedCostCents: 50 };
    expect((await attributedCosts({ execute: async () => [row] } as never, "company"))[0]).toMatchObject({ costCents: 50, estimatedCostCents: 0 });
  });
});

it("uses only the same historical run's recorded model to price a missing model", async () => {
  const base = { agentId: "a", projectId: null, projectName: null, provider: "openai", model: "unknown", billingType: "subscription_included", costStatus: "reported", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, costCents: 0, reportedCostCents: 0 };
  const rows = await attributedCosts({ execute: async () => [{ ...base, pricingModel: "gpt-6.1-sol" }, base] } as never, "company");
  expect(rows[0]).toMatchObject({ model: "unknown", estimatedCostCents: 200, unpricedEventCount: 0 });
  expect(rows[1]).toMatchObject({ model: "unknown", estimatedCostCents: 0, unpricedEventCount: 1 });
});

it("preserves exact billed totals independently of reference estimates", () => {
  const rows = [0, 1].map(() => ({ ...cost, costCents: 0.0000001, costCentsExact: "0.0000001", referenceCostCents: 20 }));
  const { teams, departments } = aggregateOrganizationCosts(rows, [membership]);
  for (const row of [...teams, ...departments]) expect(row).toMatchObject({ costCents: 0.0000002, costCentsExact: "0.0000002", referenceCostCents: 40 });
});
