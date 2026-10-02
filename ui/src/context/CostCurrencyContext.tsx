import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatCents } from "../lib/utils";

export type CostCurrency = "USD" | "CNY";

interface CostCurrencyValue {
  currency: CostCurrency;
  formatCost: (usdCents: number, unpricedEventCount?: number) => string;
}

const CostCurrencyContext = createContext<CostCurrencyValue>({ currency: "USD", formatCost: formatCents });

export function CostCurrencyProvider({ currency, rate, children }: {
  currency: CostCurrency;
  rate: number | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({
    currency,
    formatCost: (usdCents: number, unpricedEventCount = 0) => usdCents === 0 && unpricedEventCount > 0 ? "未定价" : currency === "USD"
      ? usdCents !== 0 && Math.abs(usdCents) < 1
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(usdCents / 100)
        : formatCents(usdCents)
      : rate != null && Number.isFinite(rate) && rate > 0
        ? new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: usdCents !== 0 && Math.abs(usdCents * rate) < 1 ? 6 : 2 }).format(usdCents / 100 * rate)
        : "—",
  }), [currency, rate]);
  return <CostCurrencyContext.Provider value={value}>{children}</CostCurrencyContext.Provider>;
}

export function useCostCurrency() {
  return useContext(CostCurrencyContext);
}
