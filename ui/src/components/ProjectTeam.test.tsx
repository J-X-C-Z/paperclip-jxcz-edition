// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiText } from "@/i18n";
import { ProjectTeam } from "./ProjectTeam";

const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockProjectsApi = vi.hoisted(() => ({
  listAgentMemberships: vi.fn(),
  upsertAgentMembership: vi.fn(),
  removeAgentMembership: vi.fn(),
}));

vi.mock("../api/agents", () => ({ agentsApi: mockAgentsApi }));
vi.mock("../api/projects", () => ({ projectsApi: mockProjectsApi }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function render(node: ReactNode) {
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
}

describe("ProjectTeam", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mockAgentsApi.list.mockResolvedValue([{ id: "agent-1", name: "Agent One" }]);
    mockProjectsApi.listAgentMemberships.mockResolvedValue([]);
    mockProjectsApi.upsertAgentMembership.mockRejectedValue(new Error("Membership could not be saved"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.clearAllMocks();
  });

  function setupMembers(ranks: Array<number | null> = [0, 1]) {
    const agents = ranks.map((_, index) => ({ id: `agent-${index + 1}`, name: `Agent ${index + 1}` }));
    const memberships = agents.map((agent, index) => ({ id: `member-${index + 1}`, agentId: agent.id, projectRole: null, isLead: index === 0, sortOrder: ranks[index] }));
    mockAgentsApi.list.mockResolvedValue(agents);
    mockProjectsApi.listAgentMemberships.mockImplementation(async () => [...memberships].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)));
    mockProjectsApi.upsertAgentMembership.mockImplementation(async (_projectId: string, patch: { agentId: string; sortOrder?: number; projectRole?: string | null; isLead?: boolean }) => {
      const member = memberships.find((member) => member.agentId === patch.agentId)!;
      Object.assign(member, patch);
      return member;
    });
    return memberships;
  }
  async function flushQueries() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  function moveButton(direction: "Move up" | "Move down", name: string) {
    return host.querySelector<HTMLButtonElement>(`button[aria-label="${uiText(direction)}: ${name}"]`)!;
  }
  function rowNames() {
    return [...host.querySelectorAll(".divide-y > div")].map((row) => row.querySelector("span")?.textContent);
  }

  it("persists a downward and upward move without changing member roles or leadership", async () => {
    const memberships = setupMembers();
    await render(<ProjectTeam companyId="company-1" projectId="project-a" />);
    await flushQueries();
    expect(moveButton("Move up", "Agent 1").disabled).toBe(true);
    expect(moveButton("Move down", "Agent 2").disabled).toBe(true);
    await act(async () => moveButton("Move down", "Agent 1").click());
    await flushQueries();
    expect(mockProjectsApi.upsertAgentMembership.mock.calls).toEqual([
      ["project-a", { agentId: "agent-2", sortOrder: 0 }, "company-1"],
      ["project-a", { agentId: "agent-1", sortOrder: 1 }, "company-1"],
    ]);
    expect(rowNames()).toEqual(["Agent 2", "Agent 1"]);
    expect(memberships.map((member) => member.isLead)).toEqual([true, false]);
    await act(async () => moveButton("Move up", "Agent 1").click());
    await flushQueries();
    expect(rowNames()).toEqual(["Agent 1", "Agent 2"]);
  });

  it("normalizes missing ranks and locks every member edit while sorting saves", async () => {
    setupMembers([null, null, null]);
    let finishFirstSave!: () => void;
    mockProjectsApi.upsertAgentMembership.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstSave = resolve; }));
    await render(<ProjectTeam companyId="company-1" projectId="project-a" />);
    await flushQueries();
    await act(async () => moveButton("Move down", "Agent 1").click());
    await flushQueries();
    expect(mockProjectsApi.upsertAgentMembership).toHaveBeenCalledTimes(1);
    expect([...host.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].every((control) => control.disabled)).toBe(true);
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled)).toBe(true);
    await act(async () => moveButton("Move up", "Agent 2").click());
    expect(mockProjectsApi.upsertAgentMembership).toHaveBeenCalledTimes(1);
    await act(async () => finishFirstSave());
    await flushQueries();
    expect(mockProjectsApi.upsertAgentMembership.mock.calls).toEqual([
      ["project-a", { agentId: "agent-2", sortOrder: 0 }, "company-1"],
      ["project-a", { agentId: "agent-1", sortOrder: 1 }, "company-1"],
      ["project-a", { agentId: "agent-3", sortOrder: 2 }, "company-1"],
    ]);
    expect(host.querySelector<HTMLSelectElement>("select")?.disabled).toBe(false);
  });

  it("shows failed reorder and releases editing after a refresh", async () => {
    setupMembers();
    mockProjectsApi.upsertAgentMembership.mockRejectedValueOnce(new Error("Could not reorder members"));
    await render(<ProjectTeam companyId="company-1" projectId="project-a" />);
    await flushQueries();
    await act(async () => moveButton("Move down", "Agent 1").click());
    await flushQueries();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not reorder members");
    expect(mockProjectsApi.listAgentMemberships).toHaveBeenCalledTimes(2);
    expect(moveButton("Move down", "Agent 1").disabled).toBe(false);
  });

  it("shows membership mutation failures to the operator", async () => {
    await render(<ProjectTeam companyId="company-1" projectId="project-a" />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${uiText("Add project agent")}"]`)!;
    await act(async () => {
      select.value = "agent-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const addButton = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes(uiText("Add member")))!;
    await act(async () => { addButton.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Membership could not be saved");
  });
});
