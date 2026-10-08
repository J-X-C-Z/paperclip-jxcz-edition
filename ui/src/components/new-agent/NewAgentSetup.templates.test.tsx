// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_TEMPLATES, type Agent } from "@paperclipai/shared";
import { NewAgentSetup } from "./NewAgentSetup";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams(), navigate: vi.fn(), hire: vi.fn(), list: vi.fn(), templates: vi.fn() }));
vi.mock("motion/react", () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => children, MotionConfig: ({ children }: { children: ReactNode }) => children, motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> } }));
vi.mock("@/i18n", () => ({ useUiTranslator: () => (text: string) => text, uiText: (text: string) => text }));
vi.mock("@/lib/router", () => ({ useNavigate: () => mocks.navigate, useSearchParams: () => [mocks.params] }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a" }) }));
vi.mock("@/context/DialogContext", () => ({ useDialogActions: () => ({ openNewIssue: vi.fn() }) }));
vi.mock("@/hooks/useCloudInstance", () => ({ useCloudInstance: () => false }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: mocks.list, templates: mocks.templates, hire: mocks.hire, adapterModels: async () => [] } }));
vi.mock("@/api/adapters", () => ({ adaptersApi: { list: async () => [{ type: "codex_local", loaded: true, disabled: false }] } }));
vi.mock("@/api/environments", () => ({ environmentsApi: { list: async () => [{ id: "local", driver: "local", status: "active", name: "Local", config: {} }], capabilities: async () => ({ sandboxProviders: {} }) } }));
vi.mock("@/api/instanceSettings", () => ({ instanceSettingsApi: { get: async () => ({}), getExperimental: async () => ({}), getGeneral: async () => ({}) } }));
vi.mock("@/api/companySkills", () => ({ companySkillsApi: { catalogList: async () => [], list: async () => [] } }));
vi.mock("@/api/secrets", () => ({ secretsApi: { list: async () => [], listMyUserSecrets: async () => [] } }));
vi.mock("@/adapters", () => ({ getUIAdapter: () => ({ buildAdapterConfig: (values: { model: string }) => ({ model: values.model }) }) }));
vi.mock("../AgentConfigForm", () => ({ ModelDropdown: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Model" value={value} onChange={(event) => onChange(event.target.value)} /> }));
vi.mock("../ai-connections/AiConnectionField", () => ({ aiProviderForAdapter: () => "openai", AiConnectionField: () => null }));
vi.mock("./AgentProviderConnection", () => ({ AgentProviderConnection: ({ onConnected }: { onConnected: (value: object) => void }) => <button onClick={() => onConnected({})}>Use connection</button> }));
vi.mock("../agent-config-primitives", () => ({ Field: ({ children, label }: { children: ReactNode; label: string }) => <div>{label}{children}</div> }));
vi.mock("../RuntimeTestCard", () => ({ RuntimeTestCard: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const leader = { id: "leader-a", companyId: "company-a", name: "Current leader", role: "general", status: "idle", metadata: { agentTemplate: { id: "team-leader", version: 1, role: "leader" } } } as unknown as Agent;
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function render(role: "leader" | "member" | "department_head" | "custom") {
  mocks.params = new URLSearchParams({ name: "Template agent", adapterType: "codex_local", templateId: role === "custom" ? "custom" : AGENT_TEMPLATES.find(template => template.role === role)!.id });
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NewAgentSetup /></QueryClientProvider>));
  for (let i = 0; i < 4; i++) await flush();
  await act(async () => [...document.querySelectorAll("button")].find((entry) => entry.textContent === "Use connection")!.click());
  await flush();
}
async function setValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
beforeEach(() => {
  mocks.templates.mockResolvedValue(AGENT_TEMPLATES); mocks.list.mockResolvedValue([leader]);
  mocks.hire.mockResolvedValue({ agent: { ...leader, id: "new-agent", name: "Template agent", adapterType: "codex_local", adapterConfig: {} }, approval: null });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); vi.clearAllMocks(); });

describe("template agent setup", () => {
  it("loads saved company Markdown by default and sends it as managed AGENTS.md", async () => {
    const markdown = "# Organization instructions\n\nUse the saved company workflow.\n";
    mocks.templates.mockResolvedValue(AGENT_TEMPLATES.map(entry => entry.id === "team-member" ? { ...entry, systemPrompt: markdown } : entry));
    await render("member");
    expect((document.querySelector('[aria-label="职责指令（AGENTS.md）"]') as HTMLTextAreaElement).value).toBe(markdown);
    await setValue(document.querySelector('[aria-label="组长"]') as HTMLSelectElement, leader.id);
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Finish setup"))!.click());
    expect(mocks.hire).toHaveBeenCalledWith("company-a", expect.objectContaining({ instructionsBundle: { entryFile: "AGENTS.md", files: { "AGENTS.md": markdown } } }));
  });
  it("prefills member defaults, requires a leader, and submits overrides without CEO promotion", async () => {
    await render("member");
    expect((document.querySelector('[aria-label="Model"]') as HTMLInputElement).value).toBe("gpt-6-luna");
    const finish = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Finish setup"))!;
    expect(finish.disabled).toBe(true);
    await setValue(document.querySelector('[aria-label="组长"]') as HTMLSelectElement, leader.id);
    await setValue(document.querySelector('[aria-label="Model"]') as HTMLInputElement, "custom-model");
    await setValue(document.querySelector('[aria-label="职责指令（AGENTS.md）"]') as HTMLTextAreaElement, "Custom instructions");
    expect(finish.disabled).toBe(false);
    await act(async () => finish.click());
    expect(mocks.hire).toHaveBeenCalledWith("company-a", expect.objectContaining({ templateId: "team-member", role: "general", reportsTo: leader.id, adapterConfig: { model: "custom-model" }, instructionsBundle: { entryFile: "AGENTS.md", files: { "AGENTS.md": "Custom instructions" } }, desiredSkills: AGENT_TEMPLATES.find((template) => template.role === "member")!.skills, permissions: expect.objectContaining({ canCreateAgents: false, canCreateTasks: false, canReviewTasks: false }) }));
  });
  it("submits custom title, instructions, model and neutral permissions without requiring a group leader", async () => {
    await render("custom");
    expect(document.querySelector('[aria-label="组长"]')).toBeNull();
    await setValue(document.querySelector('[aria-label="标准头衔"]') as HTMLSelectElement, "__custom__");
    await setValue(document.querySelector('[aria-label="自定义头衔"]') as HTMLInputElement, "产品设计师");
    await setValue(document.querySelector('[aria-label="职责说明"]') as HTMLTextAreaElement, "完成设计与用户研究");
    await setValue(document.querySelector('[aria-label="Model"]') as HTMLInputElement, "custom-design-model");
    await setValue(document.querySelector('[aria-label="职责指令（AGENTS.md）"]') as HTMLTextAreaElement, "Design and verify usability");
    const finish = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Finish setup"))!;
    expect(finish.disabled).toBe(false);
    await act(async () => finish.click());
    expect(mocks.hire).toHaveBeenCalledWith("company-a", expect.objectContaining({ templateId: "custom", title: "产品设计师", capabilities: "完成设计与用户研究", reportsTo: null, adapterConfig: { model: "custom-design-model" }, instructionsBundle: { entryFile: "AGENTS.md", files: { "AGENTS.md": "Design and verify usability" } }, desiredSkills: [], permissions: { canCreateTasks: false, canAssignTasks: false, canReviewTasks: false, canManageAgents: false, canCreateAgents: false, canCreateSkills: false } }));
  });
  it("prefills department authority and submits a same-company executive manager", async () => {
    const ceo = { ...leader, id: "ceo-a", role: "ceo", reportsTo: null, metadata: null } as Agent;
    mocks.list.mockResolvedValue([leader, ceo, { ...ceo, id: "ceo-foreign", companyId: "foreign" }]);
    await render("department_head");
    const manager = document.querySelector('[aria-label="汇报上级"]') as HTMLSelectElement;
    expect([...manager.options].map(option => option.value)).toEqual(["", ceo.id]);
    await setValue(manager, ceo.id);
    const finish = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Finish setup"))!;
    await act(async () => finish.click());
    expect(mocks.hire).toHaveBeenCalledWith("company-a", expect.objectContaining({ templateId: "department-head", title: "部长", reportsTo: ceo.id, permissions: expect.objectContaining({ canManageAgents: true, canReviewTasks: true }) }));
  });
  it("confirms template resets, preserves a cancelled draft and retains connection", async () => {
    await render("leader");
    await setValue(document.querySelector('[aria-label="职责指令（AGENTS.md）"]') as HTMLTextAreaElement, "Unsaved draft");
    await setValue(document.querySelector('[aria-label="模板"]') as HTMLSelectElement, "team-member");
    expect(document.body.textContent).toContain("切换智能体模板？");
    await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "取消")!.click());
    expect((document.querySelector('[aria-label="职责指令（AGENTS.md）"]') as HTMLTextAreaElement).value).toBe("Unsaved draft");
    await setValue(document.querySelector('[aria-label="模板"]') as HTMLSelectElement, "team-member");
    await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "重置并切换")!.click());
    expect((document.querySelector('[aria-label="Model"]') as HTMLInputElement).value).toBe("gpt-6-luna");
    expect(document.querySelector('[aria-label="组长"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Using the connection selected in the Connect step.");
  });
});
