// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_TEMPLATES } from "@paperclipai/shared";
import { AgentTemplates } from "./AgentTemplates";

const mocks = vi.hoisted(() => ({ templates: vi.fn(), updateTemplateDefaults: vi.fn(), navigate: vi.fn() }));
vi.mock("@/api/agents", () => ({ agentsApi: { templates: mocks.templates, updateTemplateDefaults: mocks.updateTemplateDefaults } }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company-a" }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }) }));
vi.mock("@/lib/router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/new-agent/TemplateSkillsField", () => ({ TemplateSkillsField: () => <p>Skills selection</p> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); vi.resetAllMocks(); });

it("offers direct creation from department and custom templates in the selected organization", async () => {
  mocks.templates.mockResolvedValue(AGENT_TEMPLATES);
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AgentTemplates /></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(mocks.templates).toHaveBeenCalledWith("company-a");
  for (const [label, id] of [["使用部长模板", "department-head"], ["使用自定义模板", "custom"]]) {
    const button = [...document.querySelectorAll("button")].find(entry => entry.textContent === label)!;
    expect(button).toBeTruthy();
    await act(async () => button.click());
    expect(mocks.navigate).toHaveBeenLastCalledWith(`/agents/new?templateId=${id}`);
  }
});


it("saves Markdown Instructions with Skills and restores both built-in defaults as a draft", async () => {
  const member = AGENT_TEMPLATES.find(entry => entry.id === "team-member")!;
  mocks.templates.mockResolvedValue([{ ...member, skills: [], systemPrompt: "# Saved organization instructions" }]);
  mocks.updateTemplateDefaults.mockImplementation(async (_company: string, _id: string, defaults: object) => ({ ...member, ...defaults }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AgentTemplates /></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const input = document.querySelector("textarea")!;
  expect(input.value).toBe("# Saved organization instructions");
  const markdown = "# Updated workflow\n\nVerify every result.\n";
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, markdown);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...document.querySelectorAll("button")].find(entry => entry.textContent === "保存模板默认设置")!;
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(mocks.updateTemplateDefaults).toHaveBeenCalledWith("company-a", member.id, { skills: [], systemPrompt: markdown });
  expect(document.body.textContent).toContain("已保存");
  expect(save.disabled).toBe(true);
  await act(async () => [...document.querySelectorAll("button")].find(entry => entry.textContent === "恢复内置默认")!.click());
  expect(input.value).toBe(member.systemPrompt);
  expect(save.disabled).toBe(false);
  expect(mocks.updateTemplateDefaults).toHaveBeenCalledTimes(1);
});
