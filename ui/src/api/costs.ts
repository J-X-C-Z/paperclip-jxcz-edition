import type {
  CostSummary,
  CostByAgent,
  CostByUserReport,
  CostByProviderModel,
  CostByBiller,
  CostByAgentModel,
  CostByProject,
  CostByTeam,
  CostByDepartment,
  CostWindowSpendRow,
  FinanceSummary,
  FinanceByBiller,
  FinanceByKind,
  FinanceEvent,
  ProviderQuotaResult,
} from "@paperclipai/shared";
import { api } from "./client";

function dateParams(from?: string, to?: string, projectId?: string | null): string {
  const params = new URLSearchParams();
  if (!from && !to) params.set("period", "all");
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (projectId) params.set("projectId", projectId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface CostExchangeRate {
  base: "USD";
  quote: "CNY";
  rate: number | null;
  updatedAt: string | null;
  source: string;
  stale: boolean;
}

export const costsApi = {
  exchangeRate: (companyId: string) =>
    api.get<CostExchangeRate>(`/companies/${companyId}/costs/exchange-rate`),
  summary: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostSummary>(`/companies/${companyId}/costs/summary${dateParams(from, to, projectId)}`),
  byAgent: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByAgent[]>(`/companies/${companyId}/costs/by-agent${dateParams(from, to, projectId)}`),
  byAgentModel: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByAgentModel[]>(`/companies/${companyId}/costs/by-agent-model${dateParams(from, to, projectId)}`),
  byProject: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByProject[]>(`/companies/${companyId}/costs/by-project${dateParams(from, to, projectId)}`),
  byTeam: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByTeam[]>(`/companies/${companyId}/costs/by-team${dateParams(from, to, projectId)}`),
  byDepartment: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByDepartment[]>(`/companies/${companyId}/costs/by-department${dateParams(from, to, projectId)}`),
  byProvider: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByProviderModel[]>(`/companies/${companyId}/costs/by-provider${dateParams(from, to, projectId)}`),
  byBiller: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByBiller[]>(`/companies/${companyId}/costs/by-biller${dateParams(from, to, projectId)}`),
  byUser: (companyId: string, from?: string, to?: string, projectId?: string | null) =>
    api.get<CostByUserReport>(`/companies/${companyId}/costs/by-user${dateParams(from, to, projectId)}`),
  financeSummary: (companyId: string, from?: string, to?: string) =>
    api.get<FinanceSummary>(`/companies/${companyId}/costs/finance-summary${dateParams(from, to)}`),
  financeByBiller: (companyId: string, from?: string, to?: string) =>
    api.get<FinanceByBiller[]>(`/companies/${companyId}/costs/finance-by-biller${dateParams(from, to)}`),
  financeByKind: (companyId: string, from?: string, to?: string) =>
    api.get<FinanceByKind[]>(`/companies/${companyId}/costs/finance-by-kind${dateParams(from, to)}`),
  financeEvents: (companyId: string, from?: string, to?: string, limit: number = 100) =>
    api.get<FinanceEvent[]>(`/companies/${companyId}/costs/finance-events${dateParamsWithLimit(from, to, limit)}`),
  windowSpend: (companyId: string, projectId?: string | null) =>
    api.get<CostWindowSpendRow[]>(`/companies/${companyId}/costs/window-spend${dateParams(undefined, undefined, projectId)}`),
  quotaWindows: (companyId: string) =>
    api.get<ProviderQuotaResult[]>(`/companies/${companyId}/costs/quota-windows`),
};

function dateParamsWithLimit(from?: string, to?: string, limit?: number): string {
  const params = new URLSearchParams();
  if (!from && !to) params.set("period", "all");
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
