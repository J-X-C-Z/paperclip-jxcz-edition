// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupWorkspace } from "./Groups";
import { existingGroupMembers, type GroupAgent } from "@/api/improvementTeams";

const mock = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), assign: vi.fn(), syncMembers: vi.fn() }));
vi.mock("@/api/improvementTeams", async original => ({ ...await original<typeof import("@/api/improvementTeams")>(), improvementTeamsApi: mock }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const agents: GroupAgent[] = [
  { id: "lead", name: "桌面端开发组长", title: "组长", status: "idle", reportsTo: null },
  { id: "coder", name: "桌面端开发组员", title: "开发", status: "idle", reportsTo: "lead" },
  { id: "researcher", name: "桌面端开发组员", title: "研究", status: "idle", reportsTo: "lead" },
  { id: "other", name: "其他项目组员", title: "组员", status: "idle", reportsTo: "other-lead" },
];
const team = { id: "team", name: "桌面端开发小组", projectId: "desktop", projectName: "桌面端开发", members: [{ agentId: "lead", role: "team_lead" }, { agentId: "coder", role: "member" }] };
const data = { pluginId: "plugin", agents, projects: [{ id: "desktop", name: "桌面端开发", status: "in_progress" }, { id: "mobile", name: "手机端开发", status: "in_progress" }], teams: [] as typeof team[] };
let host: HTMLDivElement; let root: Root; let cache: QueryClient;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function render(companyId = "company") {
  await act(async () => root.render(<QueryClientProvider client={cache}><GroupWorkspace key={companyId} companyId={companyId} /></QueryClientProvider>));
  await flush();
}
function button(label: string) { return [...document.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent === label)!; }
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
describe("organization groups", () => {
  beforeEach(() => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mock.list.mockResolvedValue(data); mock.save.mockResolvedValue({ teamId: "team", leadAgentId: "lead" });
    mock.syncMembers.mockResolvedValue(undefined); mock.assign.mockResolvedValue({ teamId: "team", projectId: "mobile", leadAgentId: "lead", memberAgentIds: ["lead", "coder"] });
  });
  afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); vi.resetAllMocks(); });
  it("brings in both same-name direct reports and excludes unrelated or terminated agents", () => {
    expect(existingGroupMembers([...agents, { ...agents[1]!, id: "gone", status: "terminated" }], "lead")).toEqual(["lead", "coder", "researcher"]);
  });
  it("creates from existing agents with an explicit project and retries only failed membership sync", async () => {
    mock.syncMembers.mockRejectedValueOnce(new Error("网络中断"));
    await render(); await act(async () => button("一键配置小组").click());
    await choose(document.querySelector<HTMLSelectElement>("[role=dialog] select")!, "lead");
    const dialog = document.querySelector("[role=dialog]")!;
    expect(dialog.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.value).toBe("桌面端开发小组");
    expect([...dialog.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter(entry => entry.checked)).toHaveLength(3);
    await choose(dialog.querySelectorAll<HTMLSelectElement>("select")[1]!, "desktop");
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    expect(mock.save).toHaveBeenCalledWith("plugin", { companyId: "company", projectId: "desktop", name: "桌面端开发小组", departmentId: null, leadAgentId: "lead", memberAgentIds: ["lead", "coder", "researcher"] });
    expect(host.textContent).toContain("小组已保存，项目成员同步失败");
    await act(async () => button("重试项目成员同步").click()); await flush();
    expect(mock.save).toHaveBeenCalledTimes(1); expect(mock.syncMembers).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("小组和项目成员已保存");
  });
  it("assigns the existing team and synchronizes returned members", async () => {
    mock.list.mockResolvedValue({ ...data, teams: [team] }); await render();
    expect(host.textContent).toContain("桌面端开发组长");
    await choose(host.querySelector("select")!, "mobile");
    await act(async () => button("分配项目").click()); await flush();
    expect(mock.assign).toHaveBeenCalledWith("plugin", "company", "team", "mobile");
    expect(mock.syncMembers).toHaveBeenCalledWith({ companyId: "company", teamId: "team", projectId: "mobile", leadAgentId: "lead", memberAgentIds: ["lead", "coder"] });
  });
  it("blocks project changes during a live cycle", async () => {
    mock.list.mockResolvedValue({ ...data, teams: [{ ...team, active_cycle_id: "cycle" }] }); await render();
    expect(host.querySelector("select")?.disabled).toBe(true); expect(button("分配项目").disabled).toBe(true);
    expect(host.textContent).toContain("当前周期结束后可更换项目");
  });
  it("locks other groups before a project assignment finishes", async () => {
    let finish!: (value: { teamId: string; projectId: string; leadAgentId: string; memberAgentIds: string[] }) => void;
    mock.assign.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mock.list.mockResolvedValue({ ...data, teams: [team, { ...team, id: "other-team", name: "其他小组" }] });
    await render(); await choose(host.querySelector("select")!, "mobile");
    await act(async () => button("分配项目").click());
    expect([...host.querySelectorAll("select")].every(select => select.disabled)).toBe(true);
    expect(button("一键配置小组").disabled).toBe(true);
    await act(async () => finish({ teamId: "team", projectId: "mobile", leadAgentId: "lead", memberAgentIds: ["lead"] }));
    await flush();
  });
  it("keeps company cache and open configuration separate", async () => {
    mock.list.mockImplementation(async (companyId: string) => ({ ...data, teams: companyId === "company" ? [team] : [] }));
    await render(); await act(async () => button("配置成员").click());
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    await render("second"); expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(host.textContent).not.toContain("桌面端开发小组");
    expect(cache.getQueryData(["organization-groups", "company"])).toBeDefined();
    expect(mock.list).toHaveBeenCalledWith("second");
  });
  it("filters contained groups by department while retaining all-company data", async () => {
    mock.list.mockResolvedValue({ ...data, departments: [{ id: "dev", name: "开发部", headAgentId: null }, { id: "ops", name: "运营部", headAgentId: null }], teams: [{ ...team, departmentId: "dev" }, { ...team, id: "other-team", name: "运营小组", departmentId: "ops" }] });
    await act(async () => root.render(<QueryClientProvider client={cache}><GroupWorkspace companyId="company" initialDepartmentId="dev" /></QueryClientProvider>)); await flush();
    expect(host.textContent).toContain("桌面端开发小组"); expect(host.textContent).not.toContain("运营小组");
    await choose(host.querySelector("select")!, "ops"); expect(host.textContent).toContain("运营小组");
    expect(host.textContent).not.toContain("桌面端开发小组"); expect(mock.list).toHaveBeenCalledTimes(1);
  });
  it("saves a group's department choice for backend reporting synchronization", async () => {
    mock.list.mockResolvedValue({ ...data, departments: [{ id: "dev", name: "开发部", headAgentId: "head" }], teams: [team] });
    await render(); await act(async () => button("配置成员").click());
    const dialog = document.querySelector('[role=dialog]')!;
    await choose(dialog.querySelector('select[aria-label="小组所属部门"]')!, "dev");
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await flush();
    expect(mock.save).toHaveBeenCalledWith("plugin", expect.objectContaining({ companyId: "company", teamId: "team", departmentId: "dev", leadAgentId: "lead" }));
    expect(mock.syncMembers).toHaveBeenCalled();
  });
});
