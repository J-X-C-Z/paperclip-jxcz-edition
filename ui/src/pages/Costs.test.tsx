// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Costs } from "./Costs";
import { i18n } from "@/i18n";

const budgetOverviewMock = vi.hoisted(() => vi.fn());
const workScopeMock = vi.hoisted(() => ({ projectId: null as string | null, loading: false, error: null, ready: true }));
const setBreadcrumbsMock = vi.hoisted(() => vi.fn());
const costsApiMocks = vi.hoisted(() => ({
  exchangeRate: vi.fn(),
  summary: vi.fn(),
  byAgent: vi.fn(),
  byProject: vi.fn(),
  byTeam: vi.fn(),
  byDepartment: vi.fn(),
  byAgentModel: vi.fn(),
  financeSummary: vi.fn(),
  financeByBiller: vi.fn(),
  financeByKind: vi.fn(),
  financeEvents: vi.fn(),
  byProvider: vi.fn(),
  byBiller: vi.fn(),
  windowSpend: vi.fn(),
  quotaWindows: vi.fn(),
}));

vi.mock("../api/budgets", () => ({
  budgetsApi: {
    overview: (...args: unknown[]) => budgetOverviewMock(...args),
    upsertPolicy: vi.fn(),
    resolveIncident: vi.fn(),
  },
}));

vi.mock("../api/costs", () => ({ costsApi: costsApiMocks }));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: setBreadcrumbsMock }),
}));

vi.mock("../hooks/useWorkScope", () => ({ useWorkScope: () => workScopeMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("Costs embedded Audit surfaces", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    vi.stubGlobal("localStorage", window.localStorage);
    localStorage.clear();
    costsApiMocks.exchangeRate.mockResolvedValue({ base: "USD", quote: "CNY", rate: 7, updatedAt: "2026-10-02T00:00:00.000Z", source: "test", stale: false });
    workScopeMock.projectId = null;
    await i18n.changeLanguage("en");
    costsApiMocks.summary.mockResolvedValue({ spendCents: 600, budgetCents: 0, utilizationPercent: 0 });
    costsApiMocks.byAgent.mockResolvedValue([]);
    costsApiMocks.byAgentModel.mockResolvedValue([]);
    costsApiMocks.byProject.mockResolvedValue([{ projectId: "project-1", projectName: "Project Alpha", costCents: 600, reportedCostCents: 200, estimatedCostCents: 400, unpricedEventCount: 1, inputTokens: 20, cachedInputTokens: 0, outputTokens: 10 }]);
    costsApiMocks.byTeam.mockResolvedValue([{ teamId: "team-1", teamName: "Research group", costCents: 400, inputTokens: 15, cachedInputTokens: 0, outputTokens: 5 }, { teamId: null, teamName: null, costCents: 200, inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 }]);
    costsApiMocks.byDepartment.mockResolvedValue([{ departmentId: "dept-1", departmentName: "Engineering", costCents: 600, reportedCostCents: 200, estimatedCostCents: 400, unpricedEventCount: 1, inputTokens: 20, cachedInputTokens: 0, outputTokens: 10 }]);
    costsApiMocks.financeSummary.mockResolvedValue({ debitCents: 0, creditCents: 0, netCents: 0, estimatedDebitCents: 0, eventCount: 0 });
    costsApiMocks.financeByBiller.mockResolvedValue([]);
    costsApiMocks.financeByKind.mockResolvedValue([]);
    costsApiMocks.financeEvents.mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    budgetOverviewMock.mockResolvedValue({
      policies: [],
      activeIncidents: [],
      pendingApprovalCount: 0,
      pausedAgentCount: 0,
      pausedProjectCount: 0,
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a focused Budgets section without duplicate Costs chrome or spend queries", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Costs embedded initialTab="budgets" lockTab />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(budgetOverviewMock).toHaveBeenCalledWith("company-1");
        expect(container.textContent).toContain("Budget control plane");
      });
    });
    expect(container.textContent).not.toContain("Inference spend");
    expect(container.querySelector('[role="tab"]')).toBeFalsy();
    expect(setBreadcrumbsMock).not.toHaveBeenCalled();
    for (const [name, mock] of Object.entries(costsApiMocks)) {
      if (name !== "exchangeRate") expect(mock).not.toHaveBeenCalled();
    }
    expect(container.textContent).toContain("人民币 CNY");
  });

  async function renderOverview() {
    root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(<QueryClientProvider client={queryClient}><Costs embedded hideBudgetsTab /></QueryClientProvider>);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("Project Alpha"));
    });
  }

  it("shows project, group and department recorded totals with unattributed costs", async () => {
    await renderOverview();
    expect(container.textContent).toContain("按项目");
    expect(container.textContent).toContain("按小组");
    expect(container.textContent).toContain("按部门");
    expect(container.textContent).toContain("Research group");
    expect(container.textContent).toContain("Engineering");
    expect(container.textContent).toContain("未归属");
    expect(container.textContent).toContain("$4.00");
    expect(container.textContent).toContain("$2.00");
    expect(container.textContent?.match(/参考总成本/g)).toHaveLength(4);
    expect(container.textContent).toContain("成本统计已启用");
    expect(container.textContent).toContain("未返回金额不代表免费");
    expect(container.textContent).toContain("估算并非供应商账单金额");
    expect(container.textContent).toContain("未定价 1 条事件");
    expect(container.textContent).toContain("实际 $2.00 · 估算 $4.00");
  });

  it("uses the same selected dates and project scope for all attribution dimensions", async () => {
    workScopeMock.projectId = "project-1";
    await renderOverview();
    const args = costsApiMocks.byProject.mock.calls[0];
    expect(args[0]).toBe("company-1");
    expect(args[1]).toEqual(expect.any(String));
    expect(args[2]).toEqual(expect.any(String));
    expect(args[3]).toBe("project-1");
    expect(costsApiMocks.byTeam).toHaveBeenCalledWith(...args);
    expect(costsApiMocks.byDepartment).toHaveBeenCalledWith(...args);
    expect(costsApiMocks.financeSummary).not.toHaveBeenCalled();
  });

  it("reports group failures without hiding successful department and project costs", async () => {
    costsApiMocks.byTeam.mockRejectedValueOnce(new Error("Group service unavailable"));
    await renderOverview();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Group service unavailable");
    expect(container.textContent).toContain("Engineering");
    expect(container.textContent).not.toContain("Research group");
  });

  it("does not fabricate zero spend when requests fail", async () => {
    costsApiMocks.summary.mockRejectedValueOnce(new Error("Spend unavailable"));
    root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(<QueryClientProvider client={queryClient}><Costs embedded /></QueryClientProvider>);
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("Spend unavailable"));
    });
    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toContain("$6.00");
  });

  it("converts totals and attribution rows to CNY and remembers the display preference", async () => {
    await renderOverview();
    await act(async () => {
      (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "人民币 CNY") as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("¥42.00");
    expect(container.textContent).toContain("实际 ¥14.00 · 估算 ¥28.00");
    expect(container.textContent).not.toContain("$6.00");
    expect(container.textContent).toContain("1 USD = 7.0000 CNY");
    expect(localStorage.getItem("paperclip.costs.currency")).toBe("CNY");
    act(() => root.unmount());
    await renderOverview();
    expect(container.textContent).toContain("¥42.00");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("人民币 CNY");
    await act(async () => {
      (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "美元 USD") as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("$6.00");
    expect(container.textContent).not.toContain("¥42.00");
  });

  it("discloses stale exchange rates while keeping converted amounts usable", async () => {
    localStorage.setItem("paperclip.costs.currency", "CNY");
    costsApiMocks.exchangeRate.mockResolvedValue({ base: "USD", quote: "CNY", rate: 7, updatedAt: "2026-09-30T00:00:00.000Z", source: "test", stale: true });
    await renderOverview();
    expect(container.textContent).toContain("汇率已过期");
    expect(container.textContent).toContain("¥42.00");
  });

  it("does not present USD values as CNY when the exchange rate is unavailable", async () => {
    localStorage.setItem("paperclip.costs.currency", "CNY");
    costsApiMocks.exchangeRate.mockRejectedValue(new Error("Rate unavailable"));
    await renderOverview();
    expect(container.textContent).toContain("汇率暂不可用");
    expect(container.textContent).not.toContain("¥42.00");
    expect(container.textContent).not.toContain("$6.00");
    expect(container.textContent).toContain("—");
  });

  it("keeps reference estimates visible while using actual spend for budget consumption", async () => {
    costsApiMocks.summary.mockResolvedValue({ spendCents: 0, referenceCostCents: 600, reportedCostCents: 0, estimatedCostCents: 600, budgetCents: 1000, utilizationPercent: 0 });
    await renderOverview();
    expect(container.textContent).toContain("$6.00");
    expect(container.textContent).toContain("实际 $0.00 · 估算 $6.00");
    expect(container.textContent).toContain("$0.00 of $10.00");
  });

  it("shows unpriced rows as unknown instead of a zero price", async () => {
    costsApiMocks.summary.mockResolvedValue({ spendCents: 0, referenceCostCents: 0, unpricedEventCount: 2, budgetCents: 0, utilizationPercent: 0 });
    costsApiMocks.byProject.mockResolvedValue([{ projectId: "project-1", projectName: "Project Alpha", costCents: 0, unpricedEventCount: 2, inputTokens: 20, cachedInputTokens: 0, outputTokens: 10 }]);
    await renderOverview();
    expect(container.textContent).toContain("参考合计 未定价");
    expect(container.textContent).toContain("未定价 2 条事件");
  });

});
