import { CostCurrencyProvider, useCostCurrency, type CostCurrency } from "../context/CostCurrencyContext";
import { uiText } from "@/i18n";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BudgetPolicySummary,
  CostByAgentModel,
  CostByBiller,
  CostByProviderModel,
  CostWindowSpendRow,
  FinanceEvent,
  QuotaWindow,
} from "@paperclipai/shared";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Coins, DollarSign, ReceiptText } from "lucide-react";
import { budgetsApi } from "../api/budgets";
import { costsApi } from "../api/costs";
import { BillerSpendCard } from "../components/BillerSpendCard";
import { BudgetIncidentCard } from "../components/BudgetIncidentCard";
import { BudgetPolicyCard } from "../components/BudgetPolicyCard";
import { EmptyState } from "../components/EmptyState";
import { FinanceBillerCard } from "../components/FinanceBillerCard";
import { FinanceKindCard } from "../components/FinanceKindCard";
import { FinanceTimelineCard } from "../components/FinanceTimelineCard";
import { Identity } from "../components/Identity";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { ProviderQuotaCard } from "../components/ProviderQuotaCard";
import { StatusBadge } from "../components/StatusBadge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useWorkScope } from "../hooks/useWorkScope";
import { useCompany } from "../context/CompanyContext";
import { useDateRange, PRESET_KEYS, PRESET_LABELS } from "../hooks/useDateRange";
import { queryKeys } from "../lib/queryKeys";
import { billingTypeDisplayName, cn, formatTokens, providerDisplayName } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const NO_COMPANY = "__none__";
export type CostsMainTab = "overview" | "budgets" | "providers" | "billers" | "finance";

export interface CostsProps {
  /** Render inside Audit without a second page-level title or breadcrumb. */
  embedded?: boolean;
  initialTab?: CostsMainTab;
  /** Pin the surface to one tab (used by Audit > Budgets). */
  lockTab?: boolean;
  /** Budgets is a peer Audit section, so omit it from the Costs sub-navigation. */
  hideBudgetsTab?: boolean;
}

function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon, 0, 0, 0, 0);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 23, 59, 59, 999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}

function ProviderTabLabel({ provider, rows }: { provider: string; rows: CostByProviderModel[] }) {
  const { formatCost: formatCents } = useCostCurrency();
  const totalTokens = rows.reduce((sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0);
  return (
    <span className="flex items-center gap-1.5">
      <span>{providerDisplayName(provider)}</span>
      <span className="font-mono text-xs text-muted-foreground">{formatTokens(totalTokens)}</span>
      <span className="text-xs text-muted-foreground">{formatCents(totalCost, rows.reduce((sum, row) => sum + (row.unpricedEventCount ?? 0), 0))}</span>
    </span>
  );
}

function BillerTabLabel({ biller, rows }: { biller: string; rows: CostByBiller[] }) {
  const { formatCost: formatCents } = useCostCurrency();
  const totalTokens = rows.reduce((sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0);
  return (
    <span className="flex items-center gap-1.5">
      <span>{providerDisplayName(biller)}</span>
      <span className="font-mono text-xs text-muted-foreground">{formatTokens(totalTokens)}</span>
      <span className="text-xs text-muted-foreground">{formatCents(totalCost, rows.reduce((sum, row) => sum + (row.unpricedEventCount ?? 0), 0))}</span>
    </span>
  );
}

function MetricTile({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="block p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

function FinanceSummaryCard({
  debitCents,
  creditCents,
  netCents,
  estimatedDebitCents,
  eventCount,
}: {
  debitCents: number;
  creditCents: number;
  netCents: number;
  estimatedDebitCents: number;
  eventCount: number;
}) {
  const { formatCost: formatCents } = useCostCurrency();
  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-base">{uiText("Finance ledger")}</CardTitle>
        <CardDescription> {uiText("Account-level charges that do not map to a single inference request.")} </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5 pt-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label={uiText("Debits")}
          value={formatCents(debitCents)}
          subtitle={`${eventCount} total event${eventCount === 1 ? "" : "s"} in range`}
          icon={ArrowUpRight}
        />
        <MetricTile
          label={uiText("Credits")}
          value={formatCents(creditCents)}
          subtitle={uiText("Refunds, offsets, and credit returns")}
          icon={ArrowDownLeft}
        />
        <MetricTile
          label={uiText("Net")}
          value={formatCents(netCents)}
          subtitle={uiText("Debit minus credit for the selected period")}
          icon={ReceiptText}
        />
        <MetricTile
          label={uiText("Estimated")}
          value={formatCents(estimatedDebitCents)}
          subtitle={uiText("Estimated debits that are not yet invoice-authoritative")}
          icon={Coins}
        />
      </CardContent>
    </Card>
  );
}

interface AttributionCostRow {
  id: string | null;
  name: string | null;
  costCents: number;
  reportedCostCents?: number;
  estimatedCostCents?: number;
  unpricedEventCount?: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

function AttributionCostCard({ title, description, rows, loading = false, error }: {
  title: string;
  description: string;
  rows?: AttributionCostRow[];
  loading?: boolean;
  error?: Error | null;
}) {
  const { formatCost: formatCents } = useCostCurrency();
  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-5 pt-2">
        {error ? <p role="alert" className="text-sm text-destructive">{title}加载失败：{error.message}</p>
          : loading || !rows ? <p className="text-sm text-muted-foreground">正在加载成本…</p>
          : rows.length === 0 ? <p className="text-sm text-muted-foreground">所选时间范围内暂无成本事件。</p>
          : <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">参考总成本</span>
              <span className="font-mono font-medium tabular-nums">{formatCents(rows.reduce((sum, row) => sum + row.costCents, 0), rows.reduce((sum, row) => sum + (row.unpricedEventCount ?? 0), 0))}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              实际（已报告） {rows.every((row) => row.reportedCostCents != null) ? formatCents(rows.reduce((sum, row) => sum + row.reportedCostCents!, 0)) : "未分类"}
              {" · "}估算 {rows.every((row) => row.estimatedCostCents != null) ? formatCents(rows.reduce((sum, row) => sum + row.estimatedCostCents!, 0)) : "未分类"}
            </p>
            {rows.some((row) => (row.unpricedEventCount ?? 0) > 0) ? <p className="text-xs text-muted-foreground">未定价 {rows.reduce((sum, row) => sum + (row.unpricedEventCount ?? 0), 0)} 条事件，未计入金额。</p> : null}
            {rows.map((row, index) => (
              <div key={row.id ?? `unattributed-${index}`} className="flex items-start justify-between gap-3 border border-border px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{row.name ?? row.id ?? "未归属"}</span>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="font-medium">参考合计 {formatCents(row.costCents, row.unpricedEventCount)}</div>
                  <div className="text-xs text-muted-foreground">实际 {row.reportedCostCents == null ? "未分类" : formatCents(row.reportedCostCents)} · 估算 {row.estimatedCostCents == null ? "未分类" : formatCents(row.estimatedCostCents)}</div>
                  <div className="text-xs text-muted-foreground">输入 {formatTokens(row.inputTokens)} · 缓存 {formatTokens(row.cachedInputTokens)} · 输出 {formatTokens(row.outputTokens)}</div>
                </div>
              </div>
            ))}
          </>}
      </CardContent>
    </Card>
  );
}

function CostsContent({
  embedded = false,
  initialTab = "overview",
  lockTab = false,
  hideBudgetsTab = false,
}: CostsProps = {}) {
  const { formatCost: formatCents } = useCostCurrency();
  const { selectedCompanyId } = useCompany();
  const workScope = useWorkScope();
  const projectId = workScope.projectId;
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<CostsMainTab>(initialTab);
  const [activeProvider, setActiveProvider] = useState("all");
  const [activeBiller, setActiveBiller] = useState("all");
  const showSummaryChrome = !(embedded && lockTab && initialTab === "budgets");

  const {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    from,
    to,
    customReady,
  } = useDateRange();

  useEffect(() => {
    if (!embedded) setBreadcrumbs([{ label: uiText("Costs") }]);
  }, [embedded, setBreadcrumbs]);

  useEffect(() => {
    setMainTab(initialTab);
  }, [initialTab]);

  const [today, setToday] = useState(() => new Date().toDateString());
  const todayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      todayTimerRef.current = setTimeout(() => {
        setToday(new Date().toDateString());
        schedule();
      }, ms);
    };
    schedule();
    return () => {
      if (todayTimerRef.current != null) clearTimeout(todayTimerRef.current);
    };
  }, []);

  const weekRange = useMemo(() => currentWeekRange(), [today]);
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const { data: budgetData, isLoading: budgetLoading, error: budgetError } = useQuery({
    queryKey: queryKeys.budgets.overview(companyId),
    queryFn: () => budgetsApi.overview(companyId),
    enabled: !!selectedCompanyId && workScope.ready && customReady && (!projectId || mainTab === "budgets"),
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  const invalidateBudgetViews = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(selectedCompanyId) });
  };

  const policyMutation = useMutation({
    mutationFn: (input: {
      scopeType: BudgetPolicySummary["scopeType"];
      scopeId: string;
      amount: number;
      windowKind: BudgetPolicySummary["windowKind"];
    }) =>
      budgetsApi.upsertPolicy(companyId, {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        amount: input.amount,
        windowKind: input.windowKind,
      }),
    onSuccess: invalidateBudgetViews,
  });

  const incidentMutation = useMutation({
    mutationFn: (input: { incidentId: string; action: "keep_paused" | "raise_budget_and_resume"; amount?: number }) =>
      budgetsApi.resolveIncident(companyId, input.incidentId, input),
    onSuccess: invalidateBudgetViews,
  });

  const { data: spendData, isLoading: spendLoading, error: spendError } = useQuery({
    queryKey: queryKeys.costs(companyId, from || undefined, to || undefined, projectId),
    queryFn: async () => {
      const [summary, byAgent, byProject, byAgentModel] = await Promise.all([
        costsApi.summary(companyId, from || undefined, to || undefined, projectId),
        costsApi.byAgent(companyId, from || undefined, to || undefined, projectId),
        costsApi.byProject(companyId, from || undefined, to || undefined, projectId),
        costsApi.byAgentModel(companyId, from || undefined, to || undefined, projectId),
      ]);
      return { summary, byAgent, byProject, byAgentModel };
    },
    enabled: !!selectedCompanyId && workScope.ready && customReady && showSummaryChrome,
  });

  const { data: groupCosts, isLoading: groupCostsLoading, error: groupCostsError } = useQuery({
    queryKey: ["costs-by-group", companyId, from, to, projectId],
    queryFn: () => costsApi.byTeam(companyId, from || undefined, to || undefined, projectId),
    enabled: !!selectedCompanyId && workScope.ready && customReady && showSummaryChrome && mainTab === "overview",
  });
  const { data: departmentCosts, isLoading: departmentCostsLoading, error: departmentCostsError } = useQuery({
    queryKey: ["costs-by-department", companyId, from, to, projectId],
    queryFn: () => costsApi.byDepartment(companyId, from || undefined, to || undefined, projectId),
    enabled: !!selectedCompanyId && workScope.ready && customReady && showSummaryChrome && mainTab === "overview",
  });

  const { data: financeData, isLoading: financeLoading, error: financeError } = useQuery({
    queryKey: [
      queryKeys.financeSummary(companyId, from || undefined, to || undefined),
      queryKeys.financeByBiller(companyId, from || undefined, to || undefined),
      queryKeys.financeByKind(companyId, from || undefined, to || undefined),
      queryKeys.financeEvents(companyId, from || undefined, to || undefined, 18),
    ],
    queryFn: async () => {
      const [summary, byBiller, byKind, events] = await Promise.all([
        costsApi.financeSummary(companyId, from || undefined, to || undefined),
        costsApi.financeByBiller(companyId, from || undefined, to || undefined),
        costsApi.financeByKind(companyId, from || undefined, to || undefined),
        costsApi.financeEvents(companyId, from || undefined, to || undefined, 18),
      ]);
      return { summary, byBiller, byKind, events };
    },
    enabled: !!selectedCompanyId && workScope.ready && customReady && showSummaryChrome && (!projectId || mainTab === "finance"),
  });

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpandedAgents(new Set());
  }, [companyId, from, to, projectId]);

  function toggleAgent(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  const agentModelRows = useMemo(() => {
    const map = new Map<string, CostByAgentModel[]>();
    for (const row of spendData?.byAgentModel ?? []) {
      const rows = map.get(row.agentId) ?? [];
      rows.push(row);
      map.set(row.agentId, rows);
    }
    for (const [agentId, rows] of map) {
      map.set(agentId, rows.slice().sort((a, b) => b.costCents - a.costCents));
    }
    return map;
  }, [spendData?.byAgentModel]);

  const { data: providerData } = useQuery({
    queryKey: queryKeys.usageByProvider(companyId, from || undefined, to || undefined, projectId),
    queryFn: () => costsApi.byProvider(companyId, from || undefined, to || undefined, projectId),
    enabled: !!selectedCompanyId && workScope.ready && customReady && (mainTab === "providers" || mainTab === "billers"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: billerData } = useQuery({
    queryKey: queryKeys.usageByBiller(companyId, from || undefined, to || undefined, projectId),
    queryFn: () => costsApi.byBiller(companyId, from || undefined, to || undefined, projectId),
    enabled: !!selectedCompanyId && workScope.ready && customReady && mainTab === "billers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: weekData } = useQuery({
    queryKey: queryKeys.usageByProvider(companyId, weekRange.from, weekRange.to, projectId),
    queryFn: () => costsApi.byProvider(companyId, weekRange.from, weekRange.to, projectId),
    enabled: !!selectedCompanyId && workScope.ready && (mainTab === "providers" || mainTab === "billers"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: weekBillerData } = useQuery({
    queryKey: queryKeys.usageByBiller(companyId, weekRange.from, weekRange.to, projectId),
    queryFn: () => costsApi.byBiller(companyId, weekRange.from, weekRange.to, projectId),
    enabled: !!selectedCompanyId && workScope.ready && mainTab === "billers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: windowData } = useQuery({
    queryKey: queryKeys.usageWindowSpend(companyId, projectId),
    queryFn: () => costsApi.windowSpend(companyId, projectId),
    enabled: !!selectedCompanyId && workScope.ready && mainTab === "providers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: quotaData, isLoading: quotaLoading } = useQuery({
    queryKey: queryKeys.usageQuotaWindows(companyId),
    queryFn: () => costsApi.quotaWindows(companyId),
    enabled: !!selectedCompanyId && workScope.ready && !projectId && mainTab === "providers",
    refetchInterval: 300_000,
    staleTime: 60_000,
  });

  const byProvider = useMemo(() => {
    const map = new Map<string, CostByProviderModel[]>();
    for (const row of providerData ?? []) {
      const rows = map.get(row.provider) ?? [];
      rows.push(row);
      map.set(row.provider, rows);
    }
    return map;
  }, [providerData]);

  const byBiller = useMemo(() => {
    const map = new Map<string, CostByBiller[]>();
    for (const row of billerData ?? []) {
      const rows = map.get(row.biller) ?? [];
      rows.push(row);
      map.set(row.biller, rows);
    }
    return map;
  }, [billerData]);

  const weekSpendByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of weekData ?? []) {
      map.set(row.provider, (map.get(row.provider) ?? 0) + (row.reportedCostCents ?? row.costCents));
    }
    return map;
  }, [weekData]);

  const weekSpendByBiller = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of weekBillerData ?? []) {
      map.set(row.biller, (map.get(row.biller) ?? 0) + (row.reportedCostCents ?? row.costCents));
    }
    return map;
  }, [weekBillerData]);

  const windowSpendByProvider = useMemo(() => {
    const map = new Map<string, CostWindowSpendRow[]>();
    for (const row of windowData ?? []) {
      const rows = map.get(row.provider) ?? [];
      rows.push(row);
      map.set(row.provider, rows);
    }
    return map;
  }, [windowData]);

  const quotaWindowsByProvider = useMemo(() => {
    const map = new Map<string, QuotaWindow[]>();
    for (const result of quotaData ?? []) {
      if (result.ok && result.windows.length > 0) {
        map.set(result.provider, result.windows);
      }
    }
    return map;
  }, [quotaData]);

  const quotaErrorsByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of quotaData ?? []) {
      if (!result.ok && result.error) map.set(result.provider, result.error);
    }
    return map;
  }, [quotaData]);

  const quotaSourcesByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of quotaData ?? []) {
      if (typeof result.source === "string" && result.source.length > 0) {
        map.set(result.provider, result.source);
      }
    }
    return map;
  }, [quotaData]);

  const deficitNotchByProvider = useMemo(() => {
    const map = new Map<string, boolean>();
    if (preset !== "mtd") return map;
    const budget = spendData?.summary.budgetCents ?? 0;
    if (budget <= 0) return map;
    const totalSpend = spendData?.summary.spendCents ?? 0;
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (const [providerKey, rows] of byProvider) {
      const providerCostCents = rows.reduce((sum, row) => sum + (row.reportedCostCents ?? row.costCents), 0);
      const providerShare = totalSpend > 0 ? providerCostCents / totalSpend : 0;
      const providerBudget = budget * providerShare;
      if (providerBudget <= 0) {
        map.set(providerKey, false);
        continue;
      }
      const burnRate = providerCostCents / Math.max(daysElapsed, 1);
      map.set(providerKey, providerCostCents + burnRate * (daysInMonth - daysElapsed) > providerBudget);
    }
    return map;
  }, [preset, spendData, byProvider]);

  const providers = useMemo(() => Array.from(byProvider.keys()), [byProvider]);
  const billers = useMemo(() => Array.from(byBiller.keys()), [byBiller]);

  const effectiveProvider =
    activeProvider === "all" || providers.includes(activeProvider) ? activeProvider : "all";
  useEffect(() => {
    if (effectiveProvider !== activeProvider) setActiveProvider("all");
  }, [effectiveProvider, activeProvider]);

  const effectiveBiller =
    activeBiller === "all" || billers.includes(activeBiller) ? activeBiller : "all";
  useEffect(() => {
    if (effectiveBiller !== activeBiller) setActiveBiller("all");
  }, [effectiveBiller, activeBiller]);

  const providerTabItems = useMemo(() => {
    const providerKeys = Array.from(byProvider.keys());
    const allTokens = providerKeys.reduce(
      (sum, provider) => sum + (byProvider.get(provider)?.reduce((acc, row) => acc + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0) ?? 0),
      0,
    );
    const allCents = providerKeys.reduce(
      (sum, provider) => sum + (byProvider.get(provider)?.reduce((acc, row) => acc + row.costCents, 0) ?? 0),
      0,
    );
    return [
      {
        value: "all",
        label: (
          <span className="flex items-center gap-1.5">
            <span>{uiText("All providers")}</span>
            {providerKeys.length > 0 ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{formatTokens(allTokens)}</span>
                <span className="text-xs text-muted-foreground">{formatCents(allCents, providerKeys.reduce((sum, provider) => sum + (byProvider.get(provider)?.reduce((count, row) => count + (row.unpricedEventCount ?? 0), 0) ?? 0), 0))}</span>
              </>
            ) : null}
          </span>
        ),
      },
      ...providerKeys.map((provider) => ({
        value: provider,
        label: <ProviderTabLabel provider={provider} rows={byProvider.get(provider) ?? []} />,
      })),
    ];
  }, [byProvider, formatCents]);

  const billerTabItems = useMemo(() => {
    const billerKeys = Array.from(byBiller.keys());
    const allTokens = billerKeys.reduce(
      (sum, biller) => sum + (byBiller.get(biller)?.reduce((acc, row) => acc + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0) ?? 0),
      0,
    );
    const allCents = billerKeys.reduce(
      (sum, biller) => sum + (byBiller.get(biller)?.reduce((acc, row) => acc + row.costCents, 0) ?? 0),
      0,
    );
    return [
      {
        value: "all",
        label: (
          <span className="flex items-center gap-1.5">
            <span>{uiText("All billers")}</span>
            {billerKeys.length > 0 ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{formatTokens(allTokens)}</span>
                <span className="text-xs text-muted-foreground">{formatCents(allCents, billerKeys.reduce((sum, biller) => sum + (byBiller.get(biller)?.reduce((count, row) => count + (row.unpricedEventCount ?? 0), 0) ?? 0), 0))}</span>
              </>
            ) : null}
          </span>
        ),
      },
      ...billerKeys.map((biller) => ({
        value: biller,
        label: <BillerTabLabel biller={biller} rows={byBiller.get(biller) ?? []} />,
      })),
    ];
  }, [byBiller, formatCents]);

  const inferenceTokenTotal =
    (spendData?.byAgent ?? []).reduce(
      (sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens,
      0,
    );

  const topFinanceEvents = (financeData?.events ?? []) as FinanceEvent[];
  const budgetPolicies = budgetData?.policies ?? [];
  const activeBudgetIncidents = budgetData?.activeIncidents ?? [];
  const budgetPoliciesByScope = useMemo(() => ({
    company: budgetPolicies.filter((policy) => policy.scopeType === "company"),
    agent: budgetPolicies.filter((policy) => policy.scopeType === "agent"),
    project: budgetPolicies.filter((policy) => policy.scopeType === "project"),
  }), [budgetPolicies]);

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message="Select an organization to view costs." />;
  }

  if (workScope.error) return <p role="alert" className="text-sm text-destructive">{workScope.error.message}</p>;
  if (workScope.loading) return <PageSkeleton variant="list" />;

  const showCustomPrompt = preset === "custom" && !customReady;
  const showOverviewLoading = (spendLoading || (!projectId && financeLoading)) && customReady;
  const overviewError = spendError ?? (!projectId ? financeError : null);
  return (
    <div className="space-y-6">
      {showSummaryChrome ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              {embedded ? (
                <h2 className="text-lg font-semibold text-foreground">{uiText("Costs")}</h2>
              ) : (
                <h1 className="text-3xl font-semibold tracking-tight">{uiText("Costs")}</h1>
              )}
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {projectId ? "项目实际归因的推理支出与用量。组织预算和账户财务可在对应页签查看。" : "推理支出、平台费用、额度，以及实时配额周期。"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">成本统计已启用。实际金额采用执行器报告的费用；缺少金额时按模型单价和 Token 估算，订阅 CLI 用量按 API 等价参考价展示。估算并非供应商账单金额。未返回金额不代表免费；缺少用量或单价的事件未定价，不计入合计。</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {PRESET_KEYS.map((key) => (
                <Button
                  key={key}
                  variant={preset === key ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setPreset(key)}
                  aria-pressed={preset === key}
                >
                  {PRESET_LABELS[key]}
                </Button>
              ))}
            </div>
          </div>

          {preset === "custom" ? (
            <div className="flex flex-wrap items-center gap-2 border border-border p-3">
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              />
              <span className="text-sm text-muted-foreground">{uiText("to")}</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-4">
            <MetricTile
              label="推理参考成本"
              value={spendData ? formatCents(spendData.summary.referenceCostCents ?? spendData.summary.spendCents, spendData.summary.unpricedEventCount) : "—"}
              subtitle={spendData ? `实际 ${formatCents(spendData.summary.spendCents)} · 估算 ${spendData.summary.estimatedCostCents == null ? "未分类" : formatCents(spendData.summary.estimatedCostCents)} · ${formatTokens(inferenceTokenTotal)} tokens` : "成本尚未加载"}
              icon={DollarSign}
            />
            {!projectId && <>
            <MetricTile
              label={uiText("Budget")}
              value={activeBudgetIncidents.length > 0 ? String(activeBudgetIncidents.length) : (
                spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                  ? `${spendData.summary.utilizationPercent}%`
                  : "Open"
              )}
              subtitle={
                activeBudgetIncidents.length > 0
                  ? `${budgetData?.pausedAgentCount ?? 0} agents paused · ${budgetData?.pausedProjectCount ?? 0} projects paused`
                  : spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                    ? `${formatCents(spendData.summary.spendCents)} of ${formatCents(spendData.summary.budgetCents)}`
                    : "No monthly cap configured"
              }
              icon={Coins}
            />
            <MetricTile
              label={uiText("Finance net")}
              value={financeData ? formatCents(financeData.summary.netCents) : "—"}
              subtitle={financeData ? `${formatCents(financeData.summary.debitCents)} debits · ${formatCents(financeData.summary.creditCents)} credits` : "财务尚未加载"}
              icon={ReceiptText}
            />
            <MetricTile
              label={uiText("Finance events")}
              value={financeData ? String(financeData.summary.eventCount) : "—"}
              subtitle={financeData ? `${formatCents(financeData.summary.estimatedDebitCents)} estimated in range` : "财务尚未加载"}
              icon={ArrowUpRight}
            />
            </>}
          </div>
        </div>
      ) : null}

      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as typeof mainTab)}>
        {!lockTab ? (
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="overview">总览</TabsTrigger>
            {!hideBudgetsTab ? <TabsTrigger value="budgets">{projectId ? "组织预算" : "预算"}</TabsTrigger> : null}
            <TabsTrigger value="providers">服务商</TabsTrigger>
            <TabsTrigger value="billers">计费方</TabsTrigger>
            <TabsTrigger value="finance">{projectId ? "组织财务" : "财务"}</TabsTrigger>
          </TabsList>
        ) : null}

        <TabsContent value="overview" className="mt-4 space-y-4">
          {showCustomPrompt ? (
            <p className="text-sm text-muted-foreground">{uiText("Select a start and end date to load data.")}</p>
          ) : showOverviewLoading ? (
            <PageSkeleton variant="costs" />
          ) : overviewError ? (
            <p role="alert" className="text-sm text-destructive">{(overviewError as Error).message}</p>
          ) : (
            <>
              {activeBudgetIncidents.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {activeBudgetIncidents.slice(0, 2).map((incident) => (
                    <BudgetIncidentCard
                      key={incident.id}
                      incident={incident}
                      isMutating={incidentMutation.isPending}
                      onKeepPaused={() => incidentMutation.mutate({ incidentId: incident.id, action: "keep_paused" })}
                      onRaiseAndResume={(amount) =>
                        incidentMutation.mutate({
                          incidentId: incident.id,
                          action: "raise_budget_and_resume",
                          amount,
                        })}
                    />
                  ))}
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-(--gtc-31)">
                <Card>
                  <CardHeader className="px-5 pt-5 pb-2">
                    <CardTitle className="text-base">{uiText("Inference ledger")}</CardTitle>
                    <CardDescription>参考成本包含已报告实付与 API 等价估算；预算按实付计量。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5 pt-2">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="text-3xl font-semibold tabular-nums">
                          {formatCents(spendData?.summary.referenceCostCents ?? spendData?.summary.spendCents ?? 0, spendData?.summary.unpricedEventCount)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                            ? `Budget ${formatCents(spendData.summary.budgetCents)}`
                            : projectId ? "仅统计归属于此项目的事件" : "不限额度"}
                        </div>
                      </div>
                      <div className="border border-border px-4 py-3 text-right">
                        <div className="text-(length:--text-micro) uppercase tracking-(--tracking-eyebrow) text-muted-foreground">{uiText("usage")}</div>
                        <div className="mt-1 text-lg font-medium tabular-nums">
                          {formatTokens(inferenceTokenTotal)}
                        </div>
                      </div>
                    </div>
                    {spendData?.summary.budgetCents && spendData.summary.budgetCents > 0 ? (
                      <div className="space-y-2">
                        <div className="h-2 overflow-hidden bg-muted">
                          <div
                            className={cn(
                              "h-full transition-(--tp-width-background-color) duration-150",
                              spendData.summary.utilizationPercent > 90
                                ? "bg-(--status-task-blocked)"
                                : spendData.summary.utilizationPercent > 70
                                  ? "bg-(--status-task-todo)"
                                  : "bg-(--status-task-done)",
                            )}
                            style={{ width: `${Math.min(100, spendData.summary.utilizationPercent)}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {spendData.summary.utilizationPercent}{uiText("% of monthly budget consumed in this range.")} </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {!projectId && <FinanceSummaryCard
                  debitCents={financeData?.summary.debitCents ?? 0}
                  creditCents={financeData?.summary.creditCents ?? 0}
                  netCents={financeData?.summary.netCents ?? 0}
                  estimatedDebitCents={financeData?.summary.estimatedDebitCents ?? 0}
                  eventCount={financeData?.summary.eventCount ?? 0}
                />}
              </div>

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">按所选日期和项目范围汇总推理成本，参考总成本 = 实际 + 估算。三个维度展示同一批成本，不应相加；账户费用不分摊到项目、小组或部门。</p>
                <div className="grid gap-4 xl:grid-cols-3">
                  <AttributionCostCard title="按项目" description="按任务所属项目归集，无法归属的事件单独列出。"
                    rows={spendData?.byProject.map((row) => ({ ...row, id: row.projectId, name: row.projectName }))} />
                  <AttributionCostCard title="按小组" description="按执行成员当前所属项目小组归集；未匹配或多个小组时列为未归属。"
                    rows={groupCosts?.map((row) => ({ ...row, id: row.teamId, name: row.teamName && row.projectName ? `${row.teamName} · ${row.projectName}` : row.teamName }))}
                    loading={groupCostsLoading} error={groupCostsError} />
                  <AttributionCostCard title="按部门" description="按执行成员当前所属部门归集；归属不明确时单独列出。"
                    rows={departmentCosts?.map((row) => ({ ...row, id: row.departmentId, name: row.departmentName }))}
                    loading={departmentCostsLoading} error={departmentCostsError} />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-(--gtc-32)">
                <Card>
                  <CardHeader className="px-5 pt-5 pb-2">
                    <CardTitle className="text-base">{uiText("By agent")}</CardTitle>
                    <CardDescription>{uiText("What each agent consumed in the selected period.")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 px-5 pb-5 pt-2">
                    {(spendData?.byAgent.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">{uiText("No cost events yet.")}</p>
                    ) : (
                      spendData?.byAgent.map((row) => {
                        const modelRows = agentModelRows.get(row.agentId) ?? [];
                        const isExpanded = expandedAgents.has(row.agentId);
                        const hasBreakdown = modelRows.length > 0;
                        return (
                          <div key={row.agentId} className="border border-border px-4 py-3">
                            <div
                              className={cn("flex items-start justify-between gap-3", hasBreakdown ? "cursor-pointer select-none" : "")}
                              onClick={() => hasBreakdown && toggleAgent(row.agentId)}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {hasBreakdown ? (
                                  isExpanded
                                    ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                ) : (
                                  <span className="h-3 w-3 shrink-0" />
                                )}
                                <Identity name={row.agentName ?? row.agentId} size="sm" />
                                {row.agentStatus === "terminated" ? <StatusBadge status="terminated" /> : null}
                              </div>
                              <div className="text-right text-sm tabular-nums">
                                <div className="font-medium">{formatCents(row.costCents, row.unpricedEventCount)}</div>
                                <div className="text-xs text-muted-foreground"> {uiText("in")} {formatTokens(row.inputTokens + row.cachedInputTokens)} · out {formatTokens(row.outputTokens)}
                                </div>
                                {(row.apiRunCount > 0 || row.subscriptionRunCount > 0) ? (
                                  <div className="text-xs text-muted-foreground">
                                    {row.apiRunCount > 0 ? `${row.apiRunCount} api` : "0 api"}
                                    {" · "}
                                    {row.subscriptionRunCount > 0
                                      ? `${row.subscriptionRunCount} subscription`
                                      : "0 subscription"}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {isExpanded && modelRows.length > 0 ? (
                              <div className="mt-3 space-y-2 border-l border-border pl-4">
                                {modelRows.map((modelRow) => {
                                  const sharePct = row.costCents > 0 ? Math.round((modelRow.costCents / row.costCents) * 100) : 0;
                                  return (
                                    <div
                                      key={`${modelRow.provider}:${modelRow.model}:${modelRow.billingType}`}
                                      className="flex items-start justify-between gap-3 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate font-medium text-foreground">
                                          {providerDisplayName(modelRow.provider)}
                                          <span className="mx-1 text-border">/</span>
                                          <span className="font-mono">{modelRow.model}</span>
                                        </div>
                                        <div className="truncate text-muted-foreground">
                                          {providerDisplayName(modelRow.biller)} · {billingTypeDisplayName(modelRow.billingType)}
                                        </div>
                                      </div>
                                      <div className="text-right tabular-nums">
                                        <div className="font-medium">
                                          {formatCents(modelRow.costCents, modelRow.unpricedEventCount)}
                                          <span className="ml-1 font-normal text-muted-foreground">({sharePct}%)</span>
                                        </div>
                                        <div className="text-muted-foreground">
                                          {formatTokens(modelRow.inputTokens + modelRow.cachedInputTokens + modelRow.outputTokens)} tok
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <FinanceTimelineCard rows={topFinanceEvents.slice(0, 6)} emptyMessage={uiText("No finance events yet. Add account-level charges once biller invoices or credits land.")} />
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="budgets" className="mt-4 space-y-4">
          {projectId && <p className="text-sm text-muted-foreground">组织范围的预算与暂停策略。</p>}
          {budgetLoading ? (
            <PageSkeleton variant="costs" />
          ) : budgetError ? (
            <p className="text-sm text-destructive">{(budgetError as Error).message}</p>
          ) : (
            <>
              <Card className="border-border/70 bg-(image:--gradient-extract-2)">
                <CardHeader className="px-5 pt-5 pb-3">
                  <CardTitle className="text-base">{uiText("Budget control plane")}</CardTitle>
                  <CardDescription> {uiText("Hard-stop spend limits for agents and projects. Provider subscription quota stays separate and appears under Providers.")} </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 px-5 pb-5 pt-0 md:grid-cols-4">
                  <MetricTile
                    label={uiText("Active incidents")}
                    value={String(activeBudgetIncidents.length)}
                    subtitle={uiText("Open soft or hard threshold crossings")}
                    icon={ReceiptText}
                  />
                  <MetricTile
                    label={uiText("Pending approvals")}
                    value={String(budgetData?.pendingApprovalCount ?? 0)}
                    subtitle={uiText("Budget override approvals awaiting board action")}
                    icon={ArrowUpRight}
                  />
                  <MetricTile
                    label={uiText("Paused agents")}
                    value={String(budgetData?.pausedAgentCount ?? 0)}
                    subtitle={uiText("Agent heartbeats blocked by budget")}
                    icon={Coins}
                  />
                  <MetricTile
                    label={uiText("Paused projects")}
                    value={String(budgetData?.pausedProjectCount ?? 0)}
                    subtitle={uiText("Project execution blocked by budget")}
                    icon={DollarSign}
                  />
                </CardContent>
              </Card>

              {activeBudgetIncidents.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-lg font-semibold">{uiText("Active incidents")}</h2>
                    <p className="text-sm text-muted-foreground"> {uiText("Resolve hard stops here by raising the budget or explicitly keeping the scope paused.")} </p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {activeBudgetIncidents.map((incident) => (
                      <BudgetIncidentCard
                        key={incident.id}
                        incident={incident}
                        isMutating={incidentMutation.isPending}
                        onKeepPaused={() => incidentMutation.mutate({ incidentId: incident.id, action: "keep_paused" })}
                        onRaiseAndResume={(amount) =>
                          incidentMutation.mutate({
                            incidentId: incident.id,
                            action: "raise_budget_and_resume",
                            amount,
                          })}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-5">
                {(["company", "agent", "project"] as const).map((scopeType) => {
                  const rows = budgetPoliciesByScope[scopeType];
                  if (rows.length === 0) return null;
                  return (
                    <section key={scopeType} className="space-y-3">
                      <div>
                        <h2 className="text-lg font-semibold capitalize">{scopeType === "company" ? uiText("organization") : scopeType} {uiText("budgets")}</h2>
                        <p className="text-sm text-muted-foreground">
                          {scopeType === "company"
                            ? uiText("Organization-wide monthly policy.")
                            : scopeType === "agent"
                              ? uiText("Recurring monthly spend policies for individual agents.")
                              : uiText("Lifetime spend policies for execution-bound projects.")}
                        </p>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        {rows.map((summary) => (
                          <BudgetPolicyCard
                            key={summary.policyId}
                            summary={summary}
                            isSaving={policyMutation.isPending}
                            onSave={(amount) =>
                              policyMutation.mutate({
                                scopeType: summary.scopeType,
                                scopeId: summary.scopeId,
                                amount,
                                windowKind: summary.windowKind,
                              })}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}

                {budgetPolicies.length === 0 ? (
                  <Card>
                    <CardContent className="px-5 py-8 text-sm text-muted-foreground"> {uiText("No budget policies yet. Set agent and project budgets from their detail pages, or use the existing organization monthly budget control.")} </CardContent>
                  </Card>
                ) : null}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="providers" className="mt-4 space-y-4">
          {showCustomPrompt ? (
            <p className="text-sm text-muted-foreground">{uiText("Select a start and end date to load data.")}</p>
          ) : (
            <>
              <Tabs value={effectiveProvider} onValueChange={setActiveProvider}>
                <PageTabBar items={providerTabItems} value={effectiveProvider} />

                <TabsContent value="all" className="mt-4">
                  {providers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{uiText("No cost events in this period.")}</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {providers.map((provider) => (
                        <ProviderQuotaCard
                          key={provider}
                          provider={provider}
                          rows={byProvider.get(provider) ?? []}
                          budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
                          totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
                          weekSpendCents={weekSpendByProvider.get(provider) ?? 0}
                          windowRows={windowSpendByProvider.get(provider) ?? []}
                          showDeficitNotch={deficitNotchByProvider.get(provider) ?? false}
                          quotaWindows={quotaWindowsByProvider.get(provider) ?? []}
                          quotaError={quotaErrorsByProvider.get(provider) ?? null}
                          quotaSource={quotaSourcesByProvider.get(provider) ?? null}
                          quotaLoading={quotaLoading}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {providers.map((provider) => (
                  <TabsContent key={provider} value={provider} className="mt-4">
                    <ProviderQuotaCard
                      provider={provider}
                      rows={byProvider.get(provider) ?? []}
                      budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
                      totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
                      weekSpendCents={weekSpendByProvider.get(provider) ?? 0}
                      windowRows={windowSpendByProvider.get(provider) ?? []}
                      showDeficitNotch={deficitNotchByProvider.get(provider) ?? false}
                      quotaWindows={quotaWindowsByProvider.get(provider) ?? []}
                      quotaError={quotaErrorsByProvider.get(provider) ?? null}
                      quotaSource={quotaSourcesByProvider.get(provider) ?? null}
                      quotaLoading={quotaLoading}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </TabsContent>

        <TabsContent value="billers" className="mt-4 space-y-4">
          {showCustomPrompt ? (
            <p className="text-sm text-muted-foreground">{uiText("Select a start and end date to load data.")}</p>
          ) : (
            <>
              <Tabs value={effectiveBiller} onValueChange={setActiveBiller}>
                <PageTabBar items={billerTabItems} value={effectiveBiller} />

                <TabsContent value="all" className="mt-4">
                  {billers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{uiText("No billable events in this period.")}</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {billers.map((biller) => {
                        const row = (byBiller.get(biller) ?? [])[0];
                        if (!row) return null;
                        const providerRows = (providerData ?? []).filter((entry) => entry.biller === biller);
                        return (
                          <BillerSpendCard
                            key={biller}
                            row={row}
                            weekSpendCents={weekSpendByBiller.get(biller) ?? 0}
                            budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
                            totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
                            providerRows={providerRows}
                          />
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {billers.map((biller) => {
                  const row = (byBiller.get(biller) ?? [])[0];
                  if (!row) return null;
                  const providerRows = (providerData ?? []).filter((entry) => entry.biller === biller);
                  return (
                    <TabsContent key={biller} value={biller} className="mt-4">
                      <BillerSpendCard
                        row={row}
                        weekSpendCents={weekSpendByBiller.get(biller) ?? 0}
                        budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
                        totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
                        providerRows={providerRows}
                      />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </>
          )}
        </TabsContent>

        <TabsContent value="finance" className="mt-4 space-y-4">
          {projectId && <p className="text-sm text-muted-foreground">账户财务属于整个组织，未归因到项目。</p>}
          {showCustomPrompt ? (
            <p className="text-sm text-muted-foreground">{uiText("Select a start and end date to load data.")}</p>
          ) : financeLoading ? (
            <PageSkeleton variant="costs" />
          ) : financeError ? (
            <p className="text-sm text-destructive">{(financeError as Error).message}</p>
          ) : (
            <>
              <FinanceSummaryCard
                debitCents={financeData?.summary.debitCents ?? 0}
                creditCents={financeData?.summary.creditCents ?? 0}
                netCents={financeData?.summary.netCents ?? 0}
                estimatedDebitCents={financeData?.summary.estimatedDebitCents ?? 0}
                eventCount={financeData?.summary.eventCount ?? 0}
              />

              <div className="grid gap-4 xl:grid-cols-(--gtc-33)">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="px-5 pt-5 pb-2">
                      <CardTitle className="text-base">{uiText("By biller")}</CardTitle>
                      <CardDescription>{uiText("Account-level financial events grouped by who charged or credited them.")}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 px-5 pb-5 pt-2 md:grid-cols-2">
                      {(financeData?.byBiller.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">{uiText("No finance events yet.")}</p>
                      ) : (
                        financeData?.byBiller.map((row) => <FinanceBillerCard key={row.biller} row={row} />)
                      )}
                    </CardContent>
                  </Card>
                  <FinanceTimelineCard rows={topFinanceEvents} />
                </div>

                <FinanceKindCard rows={financeData?.byKind ?? []} />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}


const CURRENCY_STORAGE_KEY = "paperclip.costs.currency";

export function Costs(props: CostsProps = {}) {
  const { selectedCompanyId } = useCompany();
  const [currency, setCurrency] = useState<CostCurrency>(() => {
    try { return localStorage.getItem(CURRENCY_STORAGE_KEY) === "CNY" ? "CNY" : "USD"; }
    catch { return "USD"; }
  });
  const { data: exchangeRate, error, isLoading } = useQuery({
    queryKey: ["costs", selectedCompanyId, "exchange-rate"],
    queryFn: () => costsApi.exchangeRate(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
  const rate = exchangeRate?.rate ?? null;
  const rateAvailable = rate != null && Number.isFinite(rate) && rate > 0;
  const selectCurrency = (next: CostCurrency) => {
    setCurrency(next);
    try { localStorage.setItem(CURRENCY_STORAGE_KEY, next); } catch { /* Storage may be unavailable. */ }
  };
  return (
    <CostCurrencyProvider currency={currency} rate={rate}>
      <div className="space-y-4">
        {selectedCompanyId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2" role="group" aria-label="费用单位">
              <span className="text-sm text-muted-foreground">费用单位</span>
              <Button size="sm" variant={currency === "USD" ? "secondary" : "ghost"} aria-pressed={currency === "USD"} onClick={() => selectCurrency("USD")}>美元 USD</Button>
              <Button size="sm" variant={currency === "CNY" ? "secondary" : "ghost"} aria-pressed={currency === "CNY"} disabled={!rateAvailable && currency !== "CNY"} onClick={() => selectCurrency("CNY")}>人民币 CNY</Button>
            </div>
            <p className="text-xs text-muted-foreground" role={error || exchangeRate?.stale ? "status" : undefined}>
              {rateAvailable ? `1 USD = ${rate.toFixed(4)} CNY · 汇率日期 ${exchangeRate?.updatedAt ? new Date(exchangeRate.updatedAt).toLocaleDateString("zh-CN") : "未知"} · 每日更新${exchangeRate?.stale ? " · 汇率已过期，暂用最近可用汇率" : ""}`
                : isLoading ? "正在加载汇率…" : "汇率暂不可用，人民币金额暂不显示；可切换美元查看。"}
            </p>
          </div>
        ) : null}
        <CostsContent {...props} />
      </div>
    </CostCurrencyProvider>
  );
}
