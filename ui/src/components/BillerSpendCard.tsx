import { useCostCurrency } from "../context/CostCurrencyContext";
import { uiText } from "@/i18n";
import { useMemo } from "react";
import type { CostByBiller, CostByProviderModel } from "@paperclipai/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuotaBar } from "./QuotaBar";
import { billingTypeDisplayName, formatTokens, providerDisplayName } from "@/lib/utils";

interface BillerSpendCardProps {
  row: CostByBiller;
  weekSpendCents: number;
  budgetMonthlyCents: number;
  /** Only compare a current-month report with the monthly budget. */
  showBudgetUtilization?: boolean;
  totalCompanySpendCents: number;
  providerRows: CostByProviderModel[];
}

export function BillerSpendCard({
  row,
  weekSpendCents,
  budgetMonthlyCents,
  showBudgetUtilization = true,
  totalCompanySpendCents,
  providerRows,
}: BillerSpendCardProps) {
  const { formatCost: formatCents } = useCostCurrency();
  const providerBreakdown = useMemo(() => {
    const map = new Map<string, { provider: string; costCents: number; unpricedEventCount: number; inputTokens: number; outputTokens: number }>();
    for (const entry of providerRows) {
      const current = map.get(entry.provider) ?? {
        provider: entry.provider,
        costCents: 0,
        unpricedEventCount: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      current.costCents += entry.referenceCostCents ?? entry.costCents;
      current.unpricedEventCount += entry.unpricedEventCount ?? 0;
      current.inputTokens += entry.inputTokens + entry.cachedInputTokens;
      current.outputTokens += entry.outputTokens;
      map.set(entry.provider, current);
    }
    return Array.from(map.values()).sort((a, b) => b.costCents - a.costCents);
  }, [providerRows]);

  const billingTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of providerRows) {
      map.set(entry.billingType, (map.get(entry.billingType) ?? 0) + (entry.referenceCostCents ?? entry.costCents));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [providerRows]);

  const reportedCostCents = row.reportedCostCents ?? row.costCents;
  const providerBudgetShare =
    budgetMonthlyCents > 0 && totalCompanySpendCents > 0
      ? (reportedCostCents / totalCompanySpendCents) * budgetMonthlyCents
      : budgetMonthlyCents;
  const budgetPct =
    providerBudgetShare > 0
      ? Math.min(100, (reportedCostCents / providerBudgetShare) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">
              {providerDisplayName(row.biller)}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              <span className="font-mono">{formatTokens(row.inputTokens + row.cachedInputTokens)}</span> {uiText("Input")} {" · "}
              <span className="font-mono">{formatTokens(row.outputTokens)}</span> {uiText("Output")}
              {" · "}
              {row.providerCount} provider{row.providerCount === 1 ? "" : "s"}
              {" · "}
              {row.modelCount} model{row.modelCount === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <span className="text-xl font-bold tabular-nums shrink-0">
            {formatCents(row.referenceCostCents ?? row.costCents, row.unpricedEventCount)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-3 space-y-4">
        <p className="text-xs text-muted-foreground">参考合计 · 实际 {formatCents(reportedCostCents)} · 估算 {row.estimatedCostCents == null ? "未分类" : formatCents(row.estimatedCostCents)}</p>
        {showBudgetUtilization && budgetMonthlyCents > 0 && (
          <QuotaBar
            label="期间实付"
            percentUsed={budgetPct}
            leftLabel={formatCents(reportedCostCents)}
            rightLabel={`${Math.round(budgetPct)}% of allocation`}
          />
        )}

        <div className="text-xs text-muted-foreground">
          {row.apiRunCount > 0 ? `${row.apiRunCount} metered run${row.apiRunCount === 1 ? "" : "s"}` : "0 metered runs"}
          {" · "}
          {row.subscriptionRunCount > 0
            ? `${row.subscriptionRunCount} subscription run${row.subscriptionRunCount === 1 ? "" : "s"}`
            : "0 subscription runs"}
          {" · "}
          本周实付 {formatCents(weekSpendCents)}
        </div>

        {billingTypeBreakdown.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Billing types
              </p>
              <div className="space-y-1.5">
                {billingTypeBreakdown.map(([billingType, costCents]) => (
                  <div key={billingType} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{billingTypeDisplayName(billingType as any)}</span>
                    <span className="font-medium tabular-nums">{formatCents(costCents, providerRows.filter((entry) => entry.billingType === billingType).reduce((sum, entry) => sum + (entry.unpricedEventCount ?? 0), 0))}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {providerBreakdown.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Upstream providers
              </p>
              <div className="space-y-1.5">
                {providerBreakdown.map((entry) => (
                  <div key={entry.provider} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{providerDisplayName(entry.provider)}</span>
                    <div className="text-right tabular-nums">
                      <div className="font-medium">{formatCents(entry.costCents, entry.unpricedEventCount)}</div>
                      <div className="text-muted-foreground">
                        {formatTokens(entry.inputTokens + entry.outputTokens)} tok
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
