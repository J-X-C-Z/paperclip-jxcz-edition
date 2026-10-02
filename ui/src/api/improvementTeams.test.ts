import { beforeEach, describe, expect, it, vi } from "vitest";
import { improvementTeamsApi } from "./improvementTeams";
const projects = vi.hoisted(() => ({ get: vi.fn(), upsertAgentMembership: vi.fn(), listAgentMemberships: vi.fn() }));
const plugins = vi.hoisted(() => ({ list: vi.fn(), bridgeGetData: vi.fn() }));
vi.mock("./projects", () => ({ projectsApi: projects }));
vi.mock("./plugins", () => ({ pluginsApi: plugins }));
const input = { companyId: "company", projectId: "project", leadAgentId: "new", memberAgentIds: ["new", "old"], previousLeadAgentId: "old" };
describe("group project membership synchronization", () => {
  beforeEach(() => {
    vi.resetAllMocks(); projects.get.mockResolvedValue({ companyId: "company" });
    projects.upsertAgentMembership.mockImplementation(async (_: string, patch: { agentId: string }) => ({ companyId: "company", projectId: "project", ...patch }));
    projects.listAgentMemberships.mockResolvedValue([{ agentId: "old", isLead: true }]);
    plugins.list.mockResolvedValue([{ id: "plugin", pluginKey: "paperclip-improvement-teams", status: "ready" }]);
    plugins.bridgeGetData.mockResolvedValue({ data: { teams: [] } });
  });
  it("demotes the previous group leader after promoting the new one", async () => {
    await improvementTeamsApi.syncMembers(input);
    expect(projects.upsertAgentMembership.mock.calls).toEqual([
      ["project", { agentId: "new", isLead: true }, "company"],
      ["project", { agentId: "old" }, "company"],
      ["project", { agentId: "old", isLead: false }, "company"],
    ]);
  });
  it("preserves a previous leader who still leads another group in that project", async () => {
    plugins.bridgeGetData.mockResolvedValue({ data: { teams: [{ projectId: "project", members: [{ agentId: "old", role: "team_lead" }] }] } });
    await improvementTeamsApi.syncMembers(input);
    expect(projects.upsertAgentMembership).toHaveBeenCalledTimes(2);
    expect(projects.listAgentMemberships).not.toHaveBeenCalled();
  });
  it("rejects another company's project before any membership write", async () => {
    projects.get.mockResolvedValue({ companyId: "other" });
    await expect(improvementTeamsApi.syncMembers(input)).rejects.toThrow("项目不属于当前公司");
    expect(projects.upsertAgentMembership).not.toHaveBeenCalled();
  });
  it("reads the scoped organization workspace without a plugin discovery waterfall", async () => {
    const result = await improvementTeamsApi.list("company");
    expect(plugins.list).not.toHaveBeenCalled();
    expect(plugins.bridgeGetData).toHaveBeenCalledWith("paperclip-improvement-teams", "company-teams", { companyId: "company" }, "company");
    expect(result.pluginId).toBe("paperclip-improvement-teams");
  });
});
