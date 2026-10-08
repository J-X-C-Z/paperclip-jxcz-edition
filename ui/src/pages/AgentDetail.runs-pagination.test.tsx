// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { RunsTab } from "./AgentDetail";
import { RunsTab as ProductionRunsTab } from "./AgentDetail.production";

const { list, get } = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: { list, get } }));
vi.mock("@/lib/router", async (original) => ({
  ...await original<typeof import("@/lib/router")>(),
  Link: (await import("react-router-dom")).Link,
}));
vi.mock("../context/SidebarContext", () => ({ useSidebar: () => ({ isMobile: true }) }));
vi.mock("../adapters", () => ({ getUIAdapter: () => null, onAdapterChange: () => () => {} }));
vi.mock("@/i18n", async (original) => ({
  ...await original<typeof import("@/i18n")>(),
  uiText: (text: string) => text,
  useUiTranslator: () => (text: string) => text,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { list.mockReset(); get.mockReset(); });

it.each([RunsTab, ProductionRunsTab])("loads history in pages and stops after a partial page (%#)", async (Tab) => {
  const rows = Array.from({ length: 26 }, (_, i) => ({
    id: `run-${i}`, companyId: "company-1", agentId: "agent-1", status: "succeeded",
    invocationSource: "timer", triggerDetail: "timer", createdAt: new Date().toISOString(),
  }));
  list.mockImplementation(async (_company, _agent, limit, { offset }) => rows.slice(offset, offset + limit));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}><MemoryRouter>
        <Tab companyId="company-1" agentId="agent-1" agentRouteId="agent-1" selectedRunId={null} adapterType="codex_local" adapterConfig={{}} />
      </MemoryRouter></QueryClientProvider>,
    ));
    await act(async () => { await vi.waitFor(() => expect(container.querySelectorAll("a")).toHaveLength(25)); });
    expect(list).toHaveBeenCalledWith("company-1", "agent-1", 25, { offset: 0, summary: true });
    const button = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Load more");
    expect(button).toBeDefined();
    await act(async () => button!.click());
    await act(async () => { await vi.waitFor(() => expect(container.querySelectorAll("a")).toHaveLength(26)); });
    expect(list).toHaveBeenLastCalledWith("company-1", "agent-1", 25, { offset: 25, summary: true });
    expect(container.textContent).not.toContain("Load more");
    expect(get).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  }
});
