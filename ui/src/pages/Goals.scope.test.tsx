// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Goals } from "./Goals";

const { scope, list } = vi.hoisted(() => ({
  scope: { enabled: true, projectId: "project-a" as string | null, projects: [{ id: "project-a", goalIds: ["goal-a"] }], loading: false, error: null as Error | null },
  list: vi.fn(),
}));
vi.mock("../context/ProjectScopeContext", () => ({ useOptionalProjectScope: () => scope }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a" }) }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }));
vi.mock("../context/DialogContext", () => ({ useDialogActions: () => ({ openNewGoal: vi.fn() }) }));
vi.mock("../api/goals", () => ({ goalsApi: { list } }));
vi.mock("../components/GoalTree", () => ({ GoalTree: ({ goals }: { goals: { id: string }[] }) => <div>{goals.map((goal) => goal.id).join(",")}</div> }));
vi.mock("../components/PageSkeleton", () => ({ PageSkeleton: () => <div>Loading scope</div> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const containers: HTMLElement[] = [];
const roots: ReturnType<typeof createRoot>[] = [];
async function renderGoals(cached = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) client.setQueryData(["goals", "company-a"], [{ id: "company-goal" }]);
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<QueryClientProvider client={client}><Goals /></QueryClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return container;
}
beforeEach(() => {
  list.mockReset().mockImplementation(async (_companyId: string, projectId?: string | null) =>
    projectId ? [{ id: "goal-a" }] : [{ id: "goal-a" }, { id: "goal-b" }],
  );
  Object.assign(scope, { enabled: true, projectId: "project-a", loading: false, error: null });
});
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach((root) => root.unmount()); });
  containers.splice(0).forEach((container) => container.remove());
});
describe("Goals project scope", () => {
  it("shows only the goals linked to the selected project", async () => {
    const container = await renderGoals();
    expect(list).toHaveBeenCalledWith("company-a", "project-a");
    expect(container.textContent).toContain("goal-a");
    expect(container.textContent).not.toContain("goal-b");
  });
  it("renders newly linked server goals while switcher relation cache is stale", async () => {
    list.mockResolvedValue([{ id: "newly-linked-goal" }]);
    const container = await renderGoals();
    expect(container.textContent).toContain("newly-linked-goal");
  });
  it("keeps company mode when the experiment is off", async () => {
    Object.assign(scope, { enabled: false, projectId: null });
    const container = await renderGoals();
    expect(container.textContent).toContain("goal-b");
  });
  it("does not expose cached company goals while project scope loads", async () => {
    Object.assign(scope, { loading: true, projectId: null });
    const container = await renderGoals(true);
    expect(list).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Loading scope");
    expect(container.textContent).not.toContain("company-goal");
  });
  it("shows scope errors without issuing a company-wide request", async () => {
    Object.assign(scope, { projectId: null, error: new Error("Project list unavailable") });
    const container = await renderGoals(true);
    expect(list).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Project list unavailable");
    expect(container.textContent).not.toContain("company-goal");
  });
});
