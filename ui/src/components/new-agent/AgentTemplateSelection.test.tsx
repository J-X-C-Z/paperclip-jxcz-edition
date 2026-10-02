// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_TEMPLATES, type Agent } from "@paperclipai/shared";
import { AgentTemplateSelection, isAvailableTemplateLeader, availableTemplateManagers, templatePermissionDefaults } from "./AgentTemplateSelection";

const templates = vi.hoisted(() => vi.fn());
vi.mock("@/api/agents", () => ({ agentsApi: { templates } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); document.body.replaceChildren(); vi.resetAllMocks(); });

async function render(onSelect = vi.fn()) {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AgentTemplateSelection companyId="company-a" onClose={vi.fn()} onSelect={onSelect} /></QueryClientProvider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return onSelect;
}

describe("agent template selection", () => {
  it("lists the company-scoped templates and passes the selected full preset", async () => {
    templates.mockResolvedValue(AGENT_TEMPLATES);
    const onSelect = await render();
    expect(templates).toHaveBeenCalledWith("company-a");
    expect(document.body.textContent).toContain("gpt-6.1-sol");
    expect(document.body.textContent).toContain("gpt-6-luna");
    expect(document.body.textContent).toContain("部长");
    expect(document.body.textContent).toContain("自定义");
    const member = [...document.querySelectorAll("button")].find((button) => button.querySelector("span")?.textContent === "组员")!;
    await act(async () => member.click());
    expect(onSelect).toHaveBeenCalledWith(AGENT_TEMPLATES.find((item) => item.role === "member"));
  });
  it("shows a recoverable API error rather than falling back to a stale preset", async () => {
    templates.mockRejectedValue(new Error("network failed"));
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("无法加载模板");
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "重试")).toBe(true);
  });
  it("maps leader and member presets to explicit server permissions", () => {
    expect(templatePermissionDefaults(AGENT_TEMPLATES.find((item) => item.role === "member")!)).toEqual({ canCreateTasks: false, canAssignTasks: false, canReviewTasks: false, canManageAgents: false, canCreateAgents: false, canCreateSkills: false });
    expect(Object.values(templatePermissionDefaults(AGENT_TEMPLATES.find((item) => item.role === "leader")!)).every(Boolean)).toBe(true);
  });
  it("keeps custom privileges minimal and recognizes department heads as managers", () => {
    expect(Object.values(templatePermissionDefaults(AGENT_TEMPLATES.find((item) => item.role === "custom")!)).every(value => value === false)).toBe(true);
    expect(Object.values(templatePermissionDefaults(AGENT_TEMPLATES.find((item) => item.role === "department_head")!)).every(Boolean)).toBe(true);
    const head = { id: "head", companyId: "company-a", name: "Head", status: "idle", reportsTo: "ceo", metadata: { agentTemplate: { role: "department_head" } } } as unknown as Agent;
    const ceo = { ...head, id: "ceo", role: "ceo", reportsTo: null, metadata: null } as Agent;
    expect(availableTemplateManagers([head, ceo, { ...head, companyId: "foreign" }, { ...head, status: "terminated" }], "company-a", "department_head")).toEqual([ceo]);
    expect(availableTemplateManagers([ceo, head], "company-a", "leader")).toEqual([head, ceo]);
    expect(availableTemplateManagers([head, ceo], "company-a", "member")).toEqual([]);
  });
  it("only offers available same-company template leaders", () => {
    const agent = { id: "leader", companyId: "company-a", status: "idle", role: "general", metadata: { agentTemplate: { id: "team-leader", version: 1, role: "leader" } } } as unknown as Agent;
    expect(isAvailableTemplateLeader(agent, "company-a")).toBe(true);
    expect(isAvailableTemplateLeader(agent, "company-b")).toBe(false);
    for (const status of ["paused", "terminated", "pending_approval"] as const) expect(isAvailableTemplateLeader({ ...agent, status }, "company-a")).toBe(false);
    expect(isAvailableTemplateLeader({ ...agent, role: "ceo", metadata: null }, "company-a")).toBe(false);
  });
});
