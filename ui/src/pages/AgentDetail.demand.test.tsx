// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HeartbeatRun } from "@paperclipai/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LatestRunCard, useAgentOverviewSkills } from "./AgentDetail";

const mocks = vi.hoisted(() => ({ skills: vi.fn(), catalog: vi.fn(), getRun: vi.fn() }));
vi.mock("../api/agents", () => ({ agentsApi: { skills: mocks.skills } }));
vi.mock("../api/companySkills", () => ({ companySkillsApi: { list: mocks.catalog } }));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: { get: mocks.getRun } }));
vi.mock("@/lib/router", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> };
});
vi.mock("../components/MarkdownBody", () => ({ MarkdownBody: ({ children }: { children: string }) => <div>{children}</div> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;
let client: QueryClient;
function Harness({ visible, agentId = "agent-1" }: { visible: boolean; agentId?: string }) {
  const skills = useAgentOverviewSkills("company-1", agentId, visible);
  return <><button onClick={skills.expand}>Expand</button><button onClick={skills.retry}>Retry</button><output>{JSON.stringify(skills)}{skills.error?.message}</output></>;
}
async function render(visible: boolean, agentId = "agent-1") {
  await act(async () => {
    root!.render(<QueryClientProvider client={client}><Harness visible={visible} agentId={agentId}/></QueryClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function expand() {
  await act(async () => { container.querySelector("button")!.click(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}
function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.skills.mockResolvedValue({ desiredSkills: Array.from({ length: 12 }, (_, i) => `skill-${i}`) });
  mocks.catalog.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ key: `skill-${i}`, name: `Skill ${i}` })));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  client?.clear();
  container?.remove();
  vi.clearAllMocks();
});
describe("Agent overview skill demand", () => {
  it("does not request the skill snapshot or company catalog before expanding", async () => {
    setup();
    await render(true);
    expect(mocks.skills).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    await expand();
    expect(mocks.skills).toHaveBeenCalledWith("agent-1", "company-1");
    expect(mocks.catalog).toHaveBeenCalledWith("company-1");
    expect(container.textContent).toContain("Skill 11");
  });
  it("waits until the overview tab is visible even after expansion", async () => {
    setup();
    await render(false);
    await expand();
    expect(mocks.skills).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    await render(true);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(mocks.skills).toHaveBeenCalledTimes(1);
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Skill 11");
  });
  it("does not eagerly load a different agent when navigating from an expanded card", async () => {
    setup();
    await render(true);
    await expand();
    await render(true, "agent-2");
    expect(mocks.skills).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('"expanded":false');
    await expand();
    expect(mocks.skills).toHaveBeenLastCalledWith("agent-2", "company-1");
  });
});

it("hydrates only the displayed overview run, retaining its summary and task link", async () => {
  setup();
  const latest = { id: "run-latest", status: "succeeded", createdAt: "2026-10-03T10:00:00Z", invocationSource: "assignment", resultJson: null, contextSnapshot: { issueId: "issue-1" } };
  mocks.getRun.mockResolvedValue({ ...latest, resultJson: { summary: "The completed work remains visible." } });
  const issues = new Map([["issue-1", { id: "issue-1", title: "Task title", status: "done", identifier: "PAP-1" }]]);
  await act(async () => {
    root!.render(<QueryClientProvider client={client}><LatestRunCard runs={[latest, { ...latest, id: "run-old", createdAt: "2026-10-02T10:00:00Z" }] as unknown as HeartbeatRun[]} agentId="agent-1" issuesById={issues}/></QueryClientProvider>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(mocks.getRun).toHaveBeenCalledTimes(1);
  expect(mocks.getRun).toHaveBeenCalledWith("run-latest");
  expect(container.textContent).toContain("The completed work remains visible.");
  expect(container.querySelector('a[href="/issues/PAP-1"]')).not.toBeNull();
});

it("reports skill lookup failures and permits a successful retry", async () => {
  setup();
  mocks.skills.mockRejectedValueOnce(new Error("Skill service unavailable"));
  await render(true);
  await expand();
  expect(container.textContent).toContain("Skill service unavailable");
  await act(async () => { container.querySelectorAll("button")[1]!.click(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(mocks.skills).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("Skill service unavailable");
  expect(container.textContent).toContain("Skill 11");
});
