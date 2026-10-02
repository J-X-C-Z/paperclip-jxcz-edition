// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectScopeProvider, useProjectScope } from "./ProjectScopeContext";
import { useScopedAgents } from "../hooks/useScopedAgents";
import { useCreationScope } from "../hooks/useCreationScope";
import { useWorkScope } from "../hooks/useWorkScope";
import { queryKeys } from "../lib/queryKeys";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), projects: vi.fn(), agents: vi.fn(), navigate: vi.fn() }));
vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-a" }),
  useOptionalCompany: () => ({ selectedCompanyId: "company-a" }),
}));
vi.mock("@/lib/router", () => ({
  useLocation: () => ({ pathname: "/tasks", search: "?project=project-a", hash: "" }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../api/instanceSettings", () => ({ instanceSettingsApi: { getExperimental: mocks.settings } }));
vi.mock("@/api/projects", () => ({ projectsApi: { list: mocks.projects, listAgentMemberships: vi.fn(async () => []) } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: mocks.agents } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
function Probe() {
  const scope = useProjectScope();
  const work = useWorkScope();
  const creation = useCreationScope();
  const agents = useScopedAgents("project-a");
  return <output>{JSON.stringify({ loading: scope.loading, error: scope.error?.message ?? null,
    ready: work.ready, canCreate: creation.ready, agents: agents.agents.map((agent) => agent.id) })}</output>;
}
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><ProjectScopeProvider><Probe /></ProjectScopeProvider></QueryClientProvider>));
  await settle();
}
function state() { return JSON.parse(host.textContent!); }

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.settings.mockRejectedValue(new Error("Settings unavailable"));
  mocks.projects.mockResolvedValue([{ id: "project-a", companyId: "company-a", name: "A" }]);
  mocks.agents.mockResolvedValue([{ id: "company-agent" }]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.agents.list("company-a"), [{ id: "cached-company-agent" }]);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); localStorage.clear();
});

describe("project scope settings availability", () => {
  it("blocks company cache, work and creation on settings failure, then recovers on a verified off response", async () => {
    await render();
    expect(state()).toEqual({ loading: false, error: "Settings unavailable", ready: false, canCreate: false, agents: [] });
    expect(mocks.agents).not.toHaveBeenCalled();
    expect(mocks.projects).not.toHaveBeenCalled();
    mocks.settings.mockResolvedValue({ enableProjectWorkspace: false });
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }); });
    await settle();
    expect(state()).toMatchObject({ loading: false, error: null, ready: true, canCreate: true });
    expect(mocks.agents).toHaveBeenCalled();
    expect(mocks.projects).not.toHaveBeenCalled();
  });

  it("does not downgrade to company scope when enabled settings fail during a refresh", async () => {
    mocks.settings.mockResolvedValue({ enableProjectWorkspace: true });
    await render(); await settle();
    expect(state().ready).toBe(true);
    mocks.agents.mockClear();
    mocks.settings.mockRejectedValue(new Error("Settings unavailable"));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }); });
    await settle();
    expect(state()).toEqual({ loading: false, error: "Settings unavailable", ready: false, canCreate: false, agents: [] });
    expect(mocks.agents).not.toHaveBeenCalled();
  });
});
