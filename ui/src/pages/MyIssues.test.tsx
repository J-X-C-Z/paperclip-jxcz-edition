// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyIssues } from "./MyIssues";

const mocks = vi.hoisted(() => ({
  listCompact: vi.fn(),
  identity: { userId: "user-a", settled: true, failed: false },
  scope: { enabled: true, projectId: "project-a", loading: false, error: null as Error | null },
}));
vi.mock("../api/issues", () => ({ issuesApi: { listCompact: mocks.listCompact } }));
vi.mock("../api/companies-query", () => ({ useAccountIdentity: () => mocks.identity }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a" }) }));
vi.mock("../context/ProjectScopeContext", () => ({ useOptionalProjectScope: () => mocks.scope }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }));
vi.mock("../hooks/useStreamlinedUiEnabled", () => ({ useStreamlinedUiEnabled: () => ({ enabled: true }) }));
vi.mock("../components/EntityRow", () => ({ EntityRow: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("../components/StatusIcon", () => ({ StatusIcon: () => null }));

let root: Root | undefined;
let container: HTMLDivElement;
let client: QueryClient;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(<QueryClientProvider client={client}><MyIssues /></QueryClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  client?.clear();
  mocks.listCompact.mockReset();
  mocks.scope.error = null;
  mocks.identity.failed = false;
  mocks.identity.settled = true;
});

describe("My Tasks page", () => {
  it("loads one page on entry and retains loading more even when legacy filtering hides every row", async () => {
    mocks.listCompact
      .mockResolvedValueOnce(Array.from({ length: 30 }, (_, index) => ({
        id: `agent-${index}`, title: `Agent task ${index}`, assigneeAgentId: "agent-a", status: "todo",
      })))
      .mockResolvedValueOnce([{ id: "human", title: "Human task", assigneeAgentId: null,
        assigneeUserId: "other-user", status: "todo", createdAt: "2026-10-03T00:00:00Z" }]);
    await render();
    expect(mocks.listCompact).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Agent task");
    const button = container.querySelector("button")!;
    expect(button).not.toBeNull();
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    expect(mocks.listCompact).toHaveBeenCalledTimes(2);
    expect(mocks.listCompact.mock.calls[1][1].offset).toBe(30);
    expect(container.textContent).toContain("Human task");
    expect(container.querySelector("button")).toBeNull();
  });

  it("does not fetch or expose cached rows when scope verification fails", async () => {
    mocks.scope.error = new Error("forbidden project");
    await render();
    expect(mocks.listCompact).not.toHaveBeenCalled();
    expect(container.textContent).toContain("无法验证账户或项目范围");
  });
});
