// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepartmentWorkspace } from "./Departments";
import { i18n, uiText } from "@/i18n";
const mock = vi.hoisted(() => ({ list: vi.fn(), saveDepartment: vi.fn() }));
vi.mock("@/api/improvementTeams", async original => ({ ...await original<typeof import("@/api/improvementTeams")>(), improvementTeamsApi: mock }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data = {
  pluginId: "plugin", departments: [{ id: "dev", name: "开发部", headAgentId: "head" }, { id: "ops", name: "运营部", headAgentId: null }],
  agents: [{ id: "head", name: "开发部长", status: "idle", templateRole: "department_head", title: "部长", reportsTo: null }], projects: [],
  teams: [
    { id: "desktop", name: "桌面端开发小组", departmentId: "dev", projectId: "desktop-project", projectName: "桌面端开发", members: [{ agentId: "head", role: "team_lead" }] },
    { id: "mobile", name: "手机端开发小组", departmentId: null, projectId: "mobile-project", projectName: "手机端开发", members: [] },
    { id: "support", name: "客服小组", departmentId: "ops", projectId: "support-project", projectName: "客户服务", members: [] },
  ],
};
let host: HTMLDivElement; let root: Root; let cache: QueryClient;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); }
async function render(companyId = "company") {
  await act(async () => root.render(<QueryClientProvider client={cache}><DepartmentWorkspace key={companyId} companyId={companyId} /></QueryClientProvider>)); await flush();
}
function button(name: string, within: ParentNode = document) { return [...within.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent === name)!; }
async function inputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("department management", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mock.list.mockResolvedValue(data); mock.saveDepartment.mockResolvedValue({ departmentId: "dev" });
  });
  afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); vi.resetAllMocks(); });
  it("shows department heads, contained groups and their project links", async () => {
    await render(); const dev = host.querySelector('[aria-label="开发部"]')!;
    expect(dev.textContent).toContain("开发部长"); expect(dev.textContent).toContain("桌面端开发小组");
    expect(dev.querySelector('a[href="/projects/desktop-project"]')).not.toBeNull();
    expect(dev.textContent).not.toContain("客服小组"); expect(host.textContent).toContain("1 个小组尚未分配部门");
  });
  it("shows prepared department content immediately while a slow refresh is pending", async () => {
    cache.setQueryData(["organization-groups", "company"], data);
    mock.list.mockReturnValue(new Promise(() => {}));
    await render();
    expect(host.textContent).toContain("开发部");
    expect(host.textContent).toContain("运营部");
    expect(host.textContent).toContain("桌面端开发小组");
    expect(host.textContent).not.toContain("正在加载部门");
  });
  it("keeps prepared departments visible when a background refresh fails", async () => {
    cache.setQueryData(["organization-groups", "company"], data);
    mock.list.mockRejectedValue(new Error("network unavailable"));
    await render();
    expect(host.textContent).toContain("开发部");
    expect(host.textContent).toContain("运营部");
    expect(host.textContent).toContain(uiText("Could not refresh; showing the previously loaded departments."));
    expect(button("重试")).toBeDefined();
  });
  it("adds available teams without taking another department's teams", async () => {
    await render(); await act(async () => button("管理部门", host.querySelector('[aria-label="开发部"]')!).click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const checks = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checks.map(entry => [entry.checked, entry.disabled])).toEqual([[true, false], [false, false], [false, true]]);
    await act(async () => button(uiText("Add all available groups"), dialog).click());
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await flush();
    expect(mock.saveDepartment).toHaveBeenCalledWith("plugin", { companyId: "company", departmentId: "dev", name: "开发部", headAgentId: "head", teamIds: ["desktop", "mobile"] });
    expect(host.textContent).toContain("部门配置已保存");
  });
  it("creates an empty operations department with no head", async () => {
    mock.list.mockResolvedValue({ ...data, departments: [], teams: [] }); await render();
    await act(async () => button("配置部门").click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await inputValue(dialog.querySelector('input')!, "运营部");
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await flush();
    expect(mock.saveDepartment).toHaveBeenCalledWith("plugin", { companyId: "company", name: "运营部", headAgentId: null, teamIds: [] });
  });
  it("keeps failed edits reviewable and protects the open form during save", async () => {
    let reject!: (error: Error) => void; mock.saveDepartment.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await render(); await act(async () => button("管理部门", host.querySelector('[aria-label="开发部"]')!).click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => button("关闭", dialog).click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => reject(new Error("小组已属其他部门"))); await flush();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("小组已属其他部门");
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("开发部");
    expect(mock.saveDepartment).toHaveBeenCalledTimes(1);
  });
  it("resets the form and company-scoped cache on company changes", async () => {
    mock.list.mockImplementation(async (id: string) => id === "company" ? data : { ...data, departments: [], teams: [] });
    await render(); await act(async () => button("配置部门").click()); await render("second");
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(host.textContent).not.toContain("开发部");
    expect(mock.list).toHaveBeenCalledWith("second"); expect(cache.getQueryData(["organization-groups", "company"])).toBeDefined();
  });
});
