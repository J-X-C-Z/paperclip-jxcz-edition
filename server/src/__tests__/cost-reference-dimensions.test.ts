import { describe, expect, it } from "vitest";
import { attachReferenceCosts } from "../services/costs.js";

describe("cost reference dimensions", () => {
  it("preserves fraction-of-cent runs and splits actual charges from estimates", () => {
    const base = { agentId: "a", projectId: null, projectName: null, inputTokens: 10, cachedInputTokens: 0, outputTokens: 0, reportedCostCents: 0, unpricedEventCount: 0 };
    const rows = attachReferenceCosts([{ agentId: "a", costCents: 0 }, { agentId: "b", costCents: 5 }], [
      { ...base, costCents: 0.002, estimatedCostCents: 0.002 },
      { ...base, costCents: 0.002, estimatedCostCents: 0.002 },
      { ...base, agentId: "b", costCents: 5, reportedCostCents: 5, estimatedCostCents: 0 },
    ], row => row.agentId, row => row.agentId);
    expect(rows.map(({ agentId, costCents }) => [agentId, costCents])).toEqual([["b", 5], ["a", 0]]);
    expect(rows[0]).toMatchObject({ agentId: "b", costCents: 5, reportedCostCents: 5, estimatedCostCents: 0, referenceCostCents: 5 });
    expect(rows[1]).toMatchObject({ agentId: "a", costCents: 0, reportedCostCents: 0 });
    expect(rows[1].estimatedCostCents).toBeCloseTo(0.004);
    expect(rows[1].referenceCostCents).toBeCloseTo(0.004);
  });
  it("keeps billing dimensions distinct for an agent using several models", () => {
    const base = { agentId: "a", projectId: null, projectName: null, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reportedCostCents: 0, unpricedEventCount: 0, estimatedCostCents: 0 };
    const rows = attachReferenceCosts([{ model: "one", costCents: 0 }, { model: "two", costCents: 0 }], [
      { ...base, model: "one", costCents: 15, estimatedCostCents: 15 },
      { ...base, model: "two", costCents: 20, estimatedCostCents: 20 },
    ], row => row.model, row => row.model ?? "unknown");
    expect(rows.map(({ model, costCents, referenceCostCents, reportedCostCents, estimatedCostCents }) =>
      [model, costCents, referenceCostCents, reportedCostCents, estimatedCostCents]))
      .toEqual([["one", 0, 15, 0, 15], ["two", 0, 20, 0, 20]]);
  });
});
