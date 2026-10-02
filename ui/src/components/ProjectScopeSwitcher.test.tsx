import { uiText } from "@/i18n";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectScopeSwitcher } from "./ProjectScopeSwitcher";

const { scope } = vi.hoisted(() => ({
  scope: {
    enabled: true,
    projectId: "project-a",
    projects: [
      { id: "project-a", companyId: "company-a", name: "Alpha" },
      { id: "project-b", companyId: "company-a", name: "Beta" },
    ],
    loading: false,
    error: null as Error | null,
    setProjectId: vi.fn(),
  },
}));

vi.mock("@/context/ProjectScopeContext", () => ({ useOptionalProjectScope: () => scope }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a" }) }));
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
  });

  it("searches projects and selects the matching project", async () => {
    const { container, cleanup } = await renderSwitcher();
    await act(async () => container.querySelector("button")!.click());
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search projects"]')!;
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

  it("hides itself while the experiment is disabled", async () => {
    scope.enabled = false;
    const { container, cleanup } = await renderSwitcher();
    expect(container.textContent).toBe("");
    await cleanup();
    scope.enabled = true;
  });
});
