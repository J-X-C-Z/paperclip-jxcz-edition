// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScopedAgents } from "./useScopedAgents";

const mockState = vi.hoisted(() => ({
  featureEnabled: true,
  featureLoaded: true,
  companyId: "company-1",
  scope: { enabled: true, projectId: "global-project" as string | null, loading: false, error: null as Error | null },
  agentList: vi.fn(),
  memberships: vi.fn(),
}));

vi.mock("../context/CompanyContext", () => ({ useOptionalCompany: () => ({ selectedCompanyId: mockState.companyId }) }));
vi.mock("../context/ProjectScopeContext", () => ({
  useOptionalProjectScope: () => mockState.scope,
}));
vi.mock("./useProjectWorkspaceEnabled", () => ({
  useProjectWorkspaceEnabled: () => ({ enabled: mockState.featureEnabled, loaded: mockState.featureLoaded }),
}));
vi.mock("../api/agents", () => ({ agentsApi: { list: mockState.agentList } }));
vi.mock("../api/projects", () => ({ projectsApi: { listAgentMemberships: mockState.memberships } }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

function Probe({ projectId, onScoped }: { projectId?: string | null; onScoped?: (scoped: ReturnType<typeof useScopedAgents>) => void }) {
  const scoped = useScopedAgents(projectId);
  onScoped?.(scoped);
  return <output>{scoped.agents.map((agent) => agent.id).join(",")}</output>;
}

async function render(node: ReactNode) {
  await act(async () => root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe("useScopedAgents membership queries", () => {
  beforeEach(() => {
    mockState.companyId = "company-1";
    mockState.featureEnabled = true;
    mockState.featureLoaded = true;
    Object.assign(mockState.scope, { enabled: true, projectId: "global-project", loading: false, error: null });
    mockState.agentList.mockResolvedValue([
      { id: "agent-a", name: "Agent A" },
      { id: "agent-b", name: "Agent B" },
    ]);
    mockState.memberships.mockImplementation(async (projectId: string) => [{ agentId: projectId === "project-a" ? "agent-a" : "agent-b" }]);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("reuses scoped arrays and member sets on unrelated renders and refreshes changed memberships", async () => {
    const observed = vi.fn();
    await render(<Probe projectId="project-a" onScoped={observed} />);
    const previous = observed.mock.lastCall![0];
    await render(<Probe projectId="project-a" onScoped={observed} />);
    const repeated = observed.mock.lastCall![0];
    expect(repeated.agents).toBe(previous.agents);
    expect(repeated.memberIds).toBe(previous.memberIds);
    await act(async () => {
      client.setQueryData(["projects", "company-1", "project-a", "agent-memberships"], [{ agentId: "agent-b" }]);
    });
    await render(<Probe projectId="project-a" onScoped={observed} />);
    expect(host.textContent).toBe("agent-b");
    expect(observed.mock.lastCall![0].agents).not.toBe(previous.agents);
  });

  it("does not retain scoped company data when the selected company changes", async () => {
    await render(<Probe projectId="project-a" />);
    expect(host.textContent).toBe("agent-a");
    mockState.companyId = "company-2";
    mockState.agentList.mockResolvedValue([{ id: "company-2-agent", name: "Company 2" }]);
    mockState.memberships.mockResolvedValue([{ agentId: "company-2-agent" }]);
    await render(<Probe projectId="project-a" />);
    expect(host.textContent).toBe("company-2-agent");
    expect(mockState.agentList).toHaveBeenCalledWith("company-2");
    expect(mockState.memberships).toHaveBeenCalledWith("project-a", "company-2");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.clearAllMocks();
  });

  it("switches membership requests with the selected project", async () => {
    await render(<Probe projectId="project-a" />);
    expect(host.textContent).toBe("agent-a");
    await render(<Probe projectId="project-b" />);
    expect(host.textContent).toBe("agent-b");
    expect(mockState.memberships.mock.calls.map(([projectId]) => projectId)).toEqual(["project-a", "project-b"]);
  });

  it("does not expose company cache while the board project validation loads or fails", async () => {
    client.setQueryData(["agents", "company-1"], [{ id: "company-agent" }]);
    Object.assign(mockState.scope, { projectId: null, loading: true });
    await render(<Probe />);
    expect(host.textContent).toBe("");
    expect(mockState.agentList).not.toHaveBeenCalled();
    Object.assign(mockState.scope, { loading: false, error: new Error("Project unavailable") });
    await render(<Probe />);
    expect(host.textContent).toBe("");
    expect(mockState.agentList).not.toHaveBeenCalled();
  });

  it("guards explicit pickers until feature settings have loaded", async () => {
    mockState.featureLoaded = false;
    client.setQueryData(["agents", "company-1"], [{ id: "company-agent" }]);
    await render(<Probe projectId="project-a" />);
    expect(host.textContent).toBe("");
    expect(mockState.memberships).not.toHaveBeenCalled();
    expect(mockState.agentList).not.toHaveBeenCalled();
  });

  it("does not fetch project memberships when the feature is off", async () => {
    mockState.featureEnabled = false;
    await render(<Probe projectId="project-a" />);
    expect(host.textContent).toBe("agent-a,agent-b");
    expect(mockState.memberships).not.toHaveBeenCalled();
  });
});
