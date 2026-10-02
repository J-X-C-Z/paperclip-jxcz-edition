import type { AgentAppearance } from "../agent-appearance.js";
import type { BillingType, CostStatus } from "../constants.js";

export interface CostEvent {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  projectId: string | null;
  goalId: string | null;
  heartbeatRunId: string | null;
  billingCode: string | null;
  provider: string;
  biller: string;
  billingType: BillingType;
  costStatus: CostStatus;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costCents: number;
  occurredAt: Date;
  createdAt: Date;
}

export interface CostSummary {
  companyId: string;
  /** Project work costs; company governance budget fields are zero in this mode. */
  projectId?: string;
  /** Incremental billed spend used by budget enforcement. */
  spendCents: number;
  /** Billed spend plus standard API reference estimates. May contain fractional cents. */
  referenceCostCents?: number;
  budgetCents: number;
  utilizationPercent: number;
  reportedCostCents?: number;
  estimatedCostCents?: number;
  unpricedEventCount?: number;
  trackingEnabled?: boolean;
}

export interface IssueCostSummary {
  issueId: string;
  issueCount: number;
  includeDescendants: boolean;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** number of distinct heartbeat runs aggregated across the issue tree */
  runCount: number;
  /** sum of wall-clock duration of each run in the tree (ms);
   * still-running runs contribute (now - startedAt) so this ticks up live */
  runtimeMs: number;
}

export interface CostReferenceTotals {
  reportedCostCents?: number;
  estimatedCostCents?: number;
  unpricedEventCount?: number;
}

export interface CostByAgent extends CostReferenceTotals {
  agentId: string;
  agentName: string | null;
  agentAppearance?: AgentAppearance | null;
  avatarUrl?: string;
  agentStatus: string | null;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
  subscriptionCachedInputTokens: number;
  subscriptionInputTokens: number;
  subscriptionOutputTokens: number;
}

export interface CostByProviderModel extends CostReferenceTotals {
  provider: string;
  biller: string;
  billingType: BillingType;
  model: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
  subscriptionCachedInputTokens: number;
  subscriptionInputTokens: number;
  subscriptionOutputTokens: number;
}

export interface CostByBiller extends CostReferenceTotals {
  biller: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
  subscriptionCachedInputTokens: number;
  subscriptionInputTokens: number;
  subscriptionOutputTokens: number;
  providerCount: number;
  modelCount: number;
}

/** per-agent breakdown by provider + model, for identifying token-hungry agents */
export interface CostByAgentModel extends CostReferenceTotals {
  agentId: string;
  agentName: string | null;
  agentAppearance?: AgentAppearance | null;
  avatarUrl?: string;
  provider: string;
  biller: string;
  billingType: BillingType;
  model: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** spend per provider for a fixed rolling time window */
export interface CostWindowSpendRow extends CostReferenceTotals {
  provider: string;
  biller: string;
  /** duration label, e.g. "5h", "24h", "7d" */
  window: string;
  /** rolling window duration in hours */
  windowHours: number;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Reported plus reference-estimated costs, using stored project, issue, or unambiguous run attribution. */
export interface CostByProject {
  reportedCostCents?: number;
  estimatedCostCents?: number;
  unpricedEventCount?: number;
  projectId: string | null;
  projectName: string | null;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Costs grouped by current project-scoped team membership; null means unassigned or ambiguous. */
export interface CostByTeam extends Omit<CostByProject, "projectId" | "projectName"> {
  teamId: string | null;
  teamName: string | null;
  projectId: string | null;
  projectName: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

export interface CostByDepartment extends Omit<CostByProject, "projectId" | "projectName"> {
  departmentId: string | null;
  departmentName: string | null;
}
