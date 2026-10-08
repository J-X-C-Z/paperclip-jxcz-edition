import { uiText } from "@/i18n";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectScopeSwitcher } from "./ProjectScopeSwitcher";

const { scope, memberships } = vi.hoisted(() => ({
  scope: {
    enabled: true,
    projectId: "project-a",
    projects: [
      { id: "project-a", companyId: "company-a", name: "Alpha", archivedAt: null as Date | null },
      { id: "project-b", companyId: "company-a", name: "Beta", archivedAt: null as Date | null },
    ],
    loading: false,
    error: null as Error | null,
    setProjectId: vi.fn(),
  },
  memberships: { data: { projectMemberships: {} as Record<string, "joined" | "left">, starredProjectIds: [] as string[] } },
}));

vi.mock("@/context/ProjectScopeContext", () => ({ useOptionalProjectScope: () => scope }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a" }) }));
vi.mock("@/hooks/useResourceMemberships", () => ({ useResourceMemberships: () => memberships }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderSwitcher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={client}><ProjectScopeSwitcher /></QueryClientProvider>));
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove(); } };
}

describe("ProjectScopeSwitcher", () => {
  beforeEach(() => {
    scope.setProjectId.mockClear();
    scope.projects = [
      { id: "project-a", companyId: "company-a", name: "Alpha", archivedAt: null },
      { id: "project-b", companyId: "company-a", name: "Beta", archivedAt: null },
    ];
    memberships.data = { projectMemberships: {}, starredProjectIds: [] };
  });

  it("searches projects and selects the matching project", async () => {
    const { container, cleanup } = await renderSwitcher();
    await act(async () => container.querySelector("button")!.click());
    const search = container.querySelector<HTMLInputElement>(`input[aria-label="${uiText("Search projects")}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "bet");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const beta = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Beta"))!;
    await act(async () => beta.click());
    expect(scope.setProjectId).toHaveBeenCalledWith("project-b");
    await cleanup();
  });

  it("selects All Company as an explicit null scope", async () => {
    const { container, cleanup } = await renderSwitcher();
    await act(async () => container.querySelector("button")!.click());
    const allCompany = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(uiText("All Company")))!;
    await act(async () => allCompany.click());
    expect(scope.setProjectId).toHaveBeenCalledWith(null);
    await cleanup();
  });

  it("hides archived projects and prioritizes starred and joined projects", async () => {
    scope.projects = [
      { id: "other", companyId: "company-a", name: "Other", archivedAt: null },
      { id: "mine", companyId: "company-a", name: "Mine", archivedAt: null },
      { id: "starred", companyId: "company-a", name: "Starred", archivedAt: null },
      { id: "archived", companyId: "company-a", name: "Archived", archivedAt: new Date() },
    ];
    memberships.data = {
      projectMemberships: { other: "left", mine: "joined", starred: "joined", archived: "joined" },
      starredProjectIds: ["starred", "archived"],
    };
    const { container, cleanup } = await renderSwitcher();
    await act(async () => container.querySelector("button")!.click());
    const options = Array.from(container.querySelectorAll('[role="option"]')).map((option) => option.textContent);
    expect(options).toEqual([uiText("All Company"), "Starred", "Mine", "Other"]);
    await cleanup();
  });

  it("hides itself while the experiment is disabled", async () => {
    scope.enabled = false;
    const { container, cleanup } = await renderSwitcher();
    expect(container.textContent).toBe("");
    await cleanup();
    scope.enabled = true;
  });
});
