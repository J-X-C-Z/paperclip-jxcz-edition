// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ProjectOrganization } from "./ProjectOrganization";

const api = vi.hoisted(() => ({ list: vi.fn(), saveProjectOrganization: vi.fn(), syncMembers: vi.fn() }));
vi.mock("@/api/improvementTeams", async original => ({ ...await original<typeof import("@/api/improvementTeams")>(), improvementTeamsApi: api }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data = {
  pluginId: "plugin", projects: [{ id: "project", name: "项目", status: "in_progress", organizationTeamIds: [], organizationDepartmentIds: [] }], agents: [],
  departments: [{ id: "dev", name: "开发部", headAgentId: "head" }],
  teams: [{ id: "team", name: "开发小组", projectId: "other", projectName: "另一项目", departmentId: "dev", members: [{ agentId: "lead", role: "team_lead" }, { agentId: "member", role: "member" }] }],
};
let host: HTMLDivElement; let root: Root; let cache: QueryClient;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function render(projectId = "project") {
  await act(async () => root.render(<QueryClientProvider client={cache}><ProjectOrganization key={projectId} companyId="company" projectId={projectId} /></QueryClientProvider>)); await flush();
}
function button(name: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent === name)!; }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await flush(); }
describe("project organization selection", () => {
  beforeEach(() => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    api.list.mockResolvedValue(data);
    api.saveProjectOrganization.mockImplementation(async (_: string, selection: { teamIds: string[]; departmentIds: string[] }) => selection);
    api.syncMembers.mockResolvedValue(undefined);
  });
  afterEach(async () => { await act(async () => root.unmount()); cache.clear(); host.remove(); vi.resetAllMocks(); });
  it("checks a department's groups and persists associations before adding members to this project", async () => {
    await render();
    await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await act(async () => button("勾选所选部门的小组").click());
    await submit();
    expect(api.saveProjectOrganization).toHaveBeenCalledWith("plugin", { companyId: "company", projectId: "project", teamIds: ["team"], departmentIds: ["dev"] });
    expect(api.syncMembers).toHaveBeenCalledWith({ companyId: "company", projectId: "project", leadAgentId: "lead", memberAgentIds: ["lead", "member"] });
    expect(host.textContent).toContain("项目组织归属和小组成员已保存");
  });
  it("honors an explicitly empty saved selection and saves deselection without changing memberships", async () => {
    api.list.mockResolvedValue({ ...data, teams: [{ ...data.teams[0], projectId: "project" }] });
    await render(); expect([...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].every(entry => !entry.checked)).toBe(true);
    await submit(); expect(api.saveProjectOrganization).toHaveBeenCalledWith("plugin", expect.objectContaining({ teamIds: [], departmentIds: [] }));
    expect(api.syncMembers).not.toHaveBeenCalled();
  });
  it("reports a partial save and retries safely when membership sync fails", async () => {
    api.list.mockResolvedValue({ ...data, projects: [{ ...data.projects[0], organizationTeamIds: ["team"] }] });
    api.syncMembers.mockRejectedValueOnce(new Error("网络中断"));
    await render(); await submit();
    expect(host.querySelector('[role=alert]')?.textContent).toContain("组织归属已保存，小组成员同步失败");
    await submit(); expect(host.textContent).toContain("项目组织归属和小组成员已保存");
    expect(api.syncMembers).toHaveBeenCalledTimes(2);
  });
  it("does not sync members when saving associations is rejected", async () => {
    api.saveProjectOrganization.mockRejectedValue(new Error("项目不属于当前公司"));
    await render(); await submit(); expect(api.syncMembers).not.toHaveBeenCalled();
    expect(host.querySelector('[role=alert]')?.textContent).toContain("项目不属于当前公司");
  });
});
