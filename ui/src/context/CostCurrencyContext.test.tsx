// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CostCurrencyProvider, useCostCurrency } from "./CostCurrencyContext";
import { FinanceKindCard } from "../components/FinanceKindCard";
import { FinanceBillerCard } from "../components/FinanceBillerCard";
import { FinanceTimelineCard } from "../components/FinanceTimelineCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function TinyCosts() {
  const { formatCost } = useCostCurrency();
  return <span>{formatCost(0.01)}</span>;
}

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

function mount(children: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(children));
}

describe("Cost currency formatting", () => {
  it("preserves small nonzero reference costs instead of rounding them to zero", () => {
    mount(<CostCurrencyProvider currency="USD" rate={7}><TinyCosts /></CostCurrencyProvider>);
    expect(container.textContent).toBe("$0.0001");
    act(() => root.render(<CostCurrencyProvider currency="CNY" rate={7}><TinyCosts /></CostCurrencyProvider>));
    expect(container.textContent).toBe("¥0.0007");
  });

  it("converts finance biller, category and event amounts consistently", () => {
    mount(<CostCurrencyProvider currency="CNY" rate={7}>
      <FinanceBillerCard row={{ biller: "openai", currency: "USD", netCents: 100, debitCents: 200, creditCents: 100, estimatedDebitCents: 50, eventCount: 1, kindCount: 1 }} />
      <FinanceKindCard rows={[{ eventKind: "byok_fee", currency: "USD", netCents: 100, debitCents: 200, creditCents: 100, estimatedDebitCents: 50, eventCount: 1, billerCount: 1 }]} />
      <FinanceTimelineCard rows={[{ id: "event", idempotencyKey: null, companyId: "company", biller: "openai", provider: null, eventKind: "byok_fee", amountCents: 200, direction: "debit", estimated: false, currency: "USD", occurredAt: new Date(), createdAt: new Date(), agentId: null, issueId: null, projectId: null, goalId: null, heartbeatRunId: null, costEventId: null, billingCode: null, description: null, executionAdapterType: null, pricingTier: null, region: null, model: null, quantity: null, unit: null, externalInvoiceId: null, metadataJson: null }]} />
    </CostCurrencyProvider>);
    expect(container.textContent).toContain("¥7.00");
    expect(container.textContent).toContain("¥14.00");
    expect(container.textContent).toContain("¥3.50");
    expect(container.textContent).not.toContain("$");
  });
  it("preserves the source currency for non-USD recorded charges", () => {
    mount(<CostCurrencyProvider currency="CNY" rate={7}>
      <FinanceBillerCard row={{ biller: "openai", currency: "EUR", netCents: 100, debitCents: 200, creditCents: 100, estimatedDebitCents: 50, eventCount: 1, kindCount: 1 }} />
    </CostCurrencyProvider>);
    expect(container.textContent).toContain("€1.00");
    expect(container.textContent).not.toContain("¥");
  });

});
