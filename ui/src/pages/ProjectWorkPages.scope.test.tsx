// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Costs } from "./Costs";
import { Search } from "./Search";
import { NewGoalDialog } from "../components/NewGoalDialog";
import { AuditFeed } from "./audit/AuditFeed";
import { queryKeys } from "../lib/queryKeys";

const { scope, cost, finance, budget, search, goalCreate, goalsList, activity, clearProject } = vi.hoisted(() => ({
  scope: { enabled: true, projectId: "project-a" as string | null, projects: [{ id: "project-a", name: "Project A", goalIds: [] }], loading: false, error: null as Error | null, setProjectId: vi.fn() },
  cost: vi.fn(), finance: vi.fn(), budget: vi.fn(), search: vi.fn(), goalCreate: vi.fn(), goalsList: vi.fn(), activity: vi.fn(), clearProject: vi.fn(),
}));
vi.mock("../context/ProjectScopeContext", () => ({ useOptionalProjectScope: () => scope }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a", selectedCompany: { issuePrefix: "A" } }) }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }));
vi.mock("../context/DialogContext", () => ({
  useDialog: () => ({ newGoalOpen: true, newGoalDefaults: {}, closeNewGoal: clearProject }),
  useDialogActions: () => ({ openNewIssue: vi.fn() }),
}));
vi.mock("../context/SidebarContext", () => ({ useSidebar: () => ({ isMobile: false }) }));
vi.mock("../context/ToastContext", () => ({ useToastActions: () => ({ pushToast: vi.fn() }) }));
vi.mock("../api/costs", () => ({ costsApi: {
  summary: cost, byAgent: vi.fn(async () => []), byAgentModel: vi.fn(async () => []), byProject: vi.fn(async () => []),
  byProvider: vi.fn(async () => []), byBiller: vi.fn(async () => []), windowSpend: vi.fn(async () => []), quotaWindows: vi.fn(async () => []),
  financeSummary: finance, financeByBiller: vi.fn(async () => []), financeByKind: vi.fn(async () => []), financeEvents: vi.fn(async () => []),
} }));
vi.mock("../api/budgets", () => ({ budgetsApi: { overview: budget } }));
vi.mock("../api/search", () => ({ searchApi: { search } }));
vi.mock("../api/goals", () => ({ goalsApi: { list: goalsList, create: goalCreate } }));
vi.mock("../api/audit", () => ({ auditApi: { listAgentActions: activity } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: vi.fn(async () => []) } }));
vi.mock("../api/access", () => ({ accessApi: { listUserDirectory: vi.fn(async () => ({ users: [] })) } }));
vi.mock("../api/projects", () => ({ projectsApi: { list: vi.fn(async () => []) } }));
vi.mock("../api/issues", () => ({ issuesApi: { listLabels: vi.fn(async () => []) } }));
vi.mock("../api/auth", () => ({ authApi: { getSession: vi.fn(async () => null) } }));
vi.mock("../components/MarkdownEditor", () => ({ MarkdownEditor: () => <div /> }));
vi.mock("../components/PageSkeleton", () => ({ PageSkeleton: () => <div>Loading scope</div> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
const hosts: HTMLElement[] = [];
async function render(node: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const host = document.createElement("div"); document.body.append(host); hosts.push(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/search?q=hello"]}>{node}</MemoryRouter></QueryClientProvider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  return { host, root, client };
}
beforeEach(() => {
  Object.assign(scope, { enabled: true, projectId: "project-a", loading: false, error: null });
  vi.clearAllMocks();
  cost.mockResolvedValue({ spendCents: 123, budgetCents: 0, utilizationPercent: 0 });
  finance.mockResolvedValue({ netCents: 90000 });
  budget.mockResolvedValue({ policies: [], activeIncidents: [] });
  goalsList.mockResolvedValue([]); goalCreate.mockResolvedValue({ id: "goal-a" });
  search.mockResolvedValue({ query: "hello", normalizedQuery: "hello", scope: "all", limit: 20, offset: 0, countsByType: {}, results: [] });
  activity.mockResolvedValue({ items: [], nextCursor: null, accessTier: "basic" });
});
afterEach(async () => { await act(async () => roots.splice(0).forEach((root) => root.unmount())); hosts.splice(0).forEach((host) => host.remove()); });

describe("project work page boundaries", () => {
  it("loads actual project cost without global finance and budget totals", async () => {
    const { host, client } = await render(<Costs />);
    expect(cost.mock.calls[0]?.[3]).toBe("project-a");
    expect(finance).not.toHaveBeenCalled(); expect(budget).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("财务净额");
    expect(client.getQueryCache().findAll({ queryKey: ["costs", "company-a"] })[0]?.queryKey).toContain("project-a");
  });
  it("guards cached company cost while scope loads or fails", async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.costs("company-a"), { summary: { spendCents: 90000 } });
    Object.assign(scope, { loading: true, projectId: null });
    const { host, root } = await render(<Costs />, client);
    expect(cost).not.toHaveBeenCalled(); expect(host.textContent).toContain("Loading scope");
    Object.assign(scope, { loading: false, error: new Error("Project unavailable") });
    await act(async () => { root.render(<QueryClientProvider client={client}><Costs /></QueryClientProvider>); });
    expect(cost).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toBe("Project unavailable");
  });
  it("scopes global search and provides an explicit company escape", async () => {
    const { host } = await render(<Search />);
    expect(search).toHaveBeenCalledWith("company-a", expect.objectContaining({ projectId: "project-a" }));
    const button = [...host.querySelectorAll("button")].find((button) => button.textContent === "搜索全部组织");
    await act(async () => button?.click());
    expect(scope.setProjectId).toHaveBeenCalledWith(null);
  });
  it("does not run company search during a failed project selection", async () => {
    Object.assign(scope, { projectId: null, error: new Error("Project unavailable") });
    const { host } = await render(<Search />);
    expect(search).not.toHaveBeenCalled(); expect(host.textContent).toContain("Project unavailable");
  });
  it("passes project attribution to the global audit feed", async () => {
    await render(<AuditFeed companyId="company-a" />);
    expect(activity).toHaveBeenCalledWith("company-a", expect.objectContaining({ projectId: "project-a" }));
  });
  it("blocks audit fallback to cached company activity on scope failure", async () => {
    Object.assign(scope, { projectId: null, error: new Error("Project unavailable") });
    await render(<AuditFeed companyId="company-a" />);
    expect(activity).not.toHaveBeenCalled();
  });
  it("offers newly linked server goals as parents before switcher relation refresh", async () => {
    goalsList.mockResolvedValue([{ id: "new-parent", title: "Newly linked goal" }]);
    await render(<NewGoalDialog />);
    expect(goalsList).toHaveBeenCalledWith("company-a", "project-a");
    const parentButton = [...document.querySelectorAll("button")].find((button) => button.textContent === "Parent goal")!;
    await act(async () => parentButton.click());
    expect(document.body.textContent).toContain("Newly linked goal");
  });
  it("creates and links a goal in one project-aware request", async () => {
    await render(<NewGoalDialog />);
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Goal title"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Project goal");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...document.querySelectorAll("button")].find((button) => button.textContent === "Create goal")!;
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(goalCreate).toHaveBeenCalledWith("company-a", expect.objectContaining({ title: "Project goal", projectId: "project-a" }));
  });
});
