import type { CostStatus } from "@paperclipai/shared";

export const TOKEN_PRICE_VERIFIED_AT = "2026-10-01";
// These live models were rechecked against the official pricing/model pages.
const LIVE_PRICE_VERIFIED_AT = "2026-10-02";
const LIVE_VERIFIED_MODELS = new Set(["gpt-6-luna", "gpt-6.1-sol", "gpt-5.6-sol"]);
const OPENAI_SOURCE = "https://developers.openai.com/api/docs/pricing";
const CLAUDE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";

type Price = { provider: string; input: number; cached: number; output: number; source: string };
const openai = (model: string, input: number, cached: number, output: number): Price => ({
  provider: "openai", input, cached, output,
  source: `https://developers.openai.com/api/docs/models/${model}`,
});
const claude = (input: number, cached: number, output: number): Price => ({
  provider: "anthropic", input, cached, output, source: CLAUDE_SOURCE,
});

// Exact model IDs only: no guesses for moving aliases ("sonnet", "gpt-6", etc.).
// Standard global API rates, USD / million tokens, verified from official pages.
const PRICES: Record<string, Price> = {
  "gpt-5.3-codex": { ...openai("gpt-5.3-codex", 1.75, 0.175, 14), source: OPENAI_SOURCE },
  "gpt-5.4": openai("gpt-5.4", 2.5, 0.25, 15),
  "gpt-5.4-mini": openai("gpt-5.4-mini", 0.75, 0.075, 4.5),
  "gpt-5.5": openai("gpt-5.5", 5, 0.5, 30),
  "gpt-5.6-sol": { ...openai("gpt-5.6-sol", 4, 0.4, 20), source: OPENAI_SOURCE },
  "gpt-6-sol": openai("gpt-6-sol", 2, 0.2, 10),
  "gpt-6.1-sol": openai("gpt-6.1-sol", 2, 0.1, 10),
  "gpt-6-astra": openai("gpt-6-astra", 10, 1, 50),
  "gpt-6-luna": openai("gpt-6-luna", 0.1, 0.01, 0.5),
  "claude-opus-5-5": claude(4, 0.2, 20),
  "claude-sonnet-5-5": claude(2, 0.2, 10),
  "claude-opus-5": claude(5, 0.5, 25),
  "claude-opus-4-8": claude(5, 0.5, 25),
  "claude-opus-4-7": claude(5, 0.5, 25),
  "claude-opus-4-6": claude(5, 0.5, 25),
  "claude-opus-4-5": claude(5, 0.5, 25),
  "claude-sonnet-5": claude(2, 0.2, 10),
  "claude-sonnet-4-6": claude(3, 0.3, 15),
  "claude-sonnet-4-5": claude(3, 0.3, 15),
  "claude-haiku-4-5": claude(1, 0.1, 5),
};

export type TokenCostInput = {
  provider?: string | null;
  model?: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

const tokens = (n: number) => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;

export function estimateTokenCostUsd(input: TokenCostInput) {
  const model = input.model?.trim().toLowerCase() ?? "";
  const price = PRICES[model];
  if (!price || input.provider?.trim().toLowerCase() !== price.provider) return null;
  const cached = tokens(input.cachedInputTokens);
  // Codex/OpenAI input includes cache hits. Claude's normalized input excludes
  // cache reads and includes cache creations; never subtract reads from it.
  const uncached = price.provider === "openai"
    ? Math.max(0, tokens(input.inputTokens) - cached)
    : tokens(input.inputTokens);
  const output = tokens(input.outputTokens);
  if (uncached + cached + output === 0) return null;
  return {
    costUsd: (uncached * price.input + cached * price.cached + output * price.output) / 1_000_000,
    priceSource: price.source,
    priceVerifiedAt: LIVE_VERIFIED_MODELS.has(model) ? LIVE_PRICE_VERIFIED_AT : TOKEN_PRICE_VERIFIED_AT,
    basis: "standard_api_equivalent" as const,
    // Per-request context tier, service tier, region and cache-write breakdown
    // are not available in aggregate adapter usage. This is a reference value.
    assumptions: "standard_global_short_context; cache_writes_at_input_rate; excludes_tools",
  };
}

export function resolveRunCost(input: TokenCostInput & {
  billingType?: string | null;
  costUsd?: number | null;
  cacheAdjustedCostUsd?: number | null;
}) {
  const reported = [input.cacheAdjustedCostUsd, input.costUsd].find(
    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  // Subscription-included zero is the incremental bill, not a zero token value.
  const subscriptionReference = input.billingType === "subscription_included" || input.billingType === "subscription";
  if (reported != null && !(subscriptionReference && reported === 0)) return { costUsd: reported, costStatus: "reported" as CostStatus, estimate: null };
  const estimate = estimateTokenCostUsd(input);
  if (estimate) return { costUsd: estimate.costUsd, costStatus: "estimated" as CostStatus, estimate };
  const hasUsage = tokens(input.inputTokens) + tokens(input.cachedInputTokens) + tokens(input.outputTokens) > 0;
  // No tokens is not a zero-cost receipt: paused turns can be unpriced.
  // Preserve an explicit subscription zero only when there is no usage to value.
  return { costUsd: !hasUsage ? reported ?? null : null, costStatus: (!hasUsage && reported != null ? "reported" : "unpriced") as CostStatus, estimate: null };
}
