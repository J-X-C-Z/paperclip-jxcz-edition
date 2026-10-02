import { describe, expect, it } from "vitest";
import { estimateTokenCostUsd, resolveRunCost } from "../services/cost-estimation.js";

const usage = { provider: "openai", model: "gpt-5.4", inputTokens: 100_000, cachedInputTokens: 80_000, outputTokens: 10_000 };

describe("token cost estimation", () => {
  it("prices OpenAI cache hits once, using uncached input plus cached input", () => {
    expect(estimateTokenCostUsd(usage)?.costUsd).toBeCloseTo(0.22);
  });
  it("does not subtract Claude cache hits from uncached input", () => {
    expect(estimateTokenCostUsd({ ...usage, provider: "anthropic", model: "claude-sonnet-4-6" })?.costUsd).toBeCloseTo(0.474);
  });
  it("preserves provider-reported zero and actual amounts before estimation", () => {
    expect(resolveRunCost({ ...usage, costUsd: 0 })).toMatchObject({ costUsd: 0, costStatus: "reported", estimate: null });
    expect(resolveRunCost({ ...usage, costUsd: 1, cacheAdjustedCostUsd: 0.5 })).toMatchObject({ costUsd: 0.5, costStatus: "reported" });
  });
  it("treats subscription-included zero as a reference estimate while preserving API zero", () => {
    expect(resolveRunCost({ ...usage, costUsd: 0, billingType: "subscription_included" })).toMatchObject({ costUsd: 0.22, costStatus: "estimated" });
    expect(resolveRunCost({ ...usage, costUsd: 0, billingType: "metered_api" })).toMatchObject({ costUsd: 0, costStatus: "reported" });
    expect(resolveRunCost({ ...usage, costUsd: 0, model: "unknown", billingType: "subscription_included" }).costStatus).toBe("unpriced");
  });
  it("estimates absent or invalid costs and attaches verifiable provenance", () => {
    expect(resolveRunCost({ ...usage, costUsd: Number.NaN })).toMatchObject({ costUsd: 0.22, costStatus: "estimated", estimate: { priceVerifiedAt: "2026-10-01", basis: "standard_api_equivalent" } });
  });
  it("leaves unknown or mismatched models unpriced rather than guessing", () => {
    expect(resolveRunCost({ ...usage, model: "gpt-99" }).costStatus).toBe("unpriced");
    expect(estimateTokenCostUsd({ ...usage, provider: "other-provider" })).toBeNull();
    expect(estimateTokenCostUsd({ ...usage, model: "gpt-5.4-custom" })).toBeNull();
  });
  it("avoids invalid negative or nonfinite usage and empty runs", () => {
    expect(estimateTokenCostUsd({ ...usage, inputTokens: -1, cachedInputTokens: Number.NaN, outputTokens: Number.POSITIVE_INFINITY })).toBeNull();
    expect(resolveRunCost({ ...usage, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }).costStatus).toBe("unpriced");
  });
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])("keeps empty paused turns without a valid receipt unpriced (%s)", (costUsd) => {
    expect(resolveRunCost({ ...usage, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd })).toMatchObject({ costUsd: null, costStatus: "unpriced", estimate: null });
  });
  it("preserves an explicit zero receipt for an empty subscription turn", () => {
    expect(resolveRunCost({ ...usage, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, billingType: "subscription_included" })).toMatchObject({ costUsd: 0, costStatus: "reported", estimate: null });
  });
  it("uses published GPT-6 rates without aliasing distinct cache rates", () => {
    expect(estimateTokenCostUsd({ ...usage, model: "gpt-6-sol" })?.costUsd).toBeCloseTo(0.156);
    expect(estimateTokenCostUsd({ ...usage, model: "gpt-6.1-sol" })?.costUsd).toBeCloseTo(0.148);
  });
});
