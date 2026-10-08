import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), createIssue: vi.fn(), wakeup: vi.fn() }));
vi.mock("../services/built-in-agents.js", () => ({ builtInAgentService: () => ({ get: mocks.get }) }));
vi.mock("../services/issues.js", () => ({ issueService: () => ({ create: mocks.createIssue }) }));
vi.mock("../services/heartbeat.js", () => ({ heartbeatService: () => ({ wakeup: mocks.wakeup }) }));
vi.mock("@paperclipai/db", async () => {
  const { agents } = await import("../../../packages/db/src/schema/agents.js");
  const { briefs, briefSettings } = await import("../../../packages/db/src/schema/briefs.js");
  const { projects } = await import("../../../packages/db/src/schema/projects.js");
  const { issues } = await import("../../../packages/db/src/schema/issues.js");
  return { agents, briefs, briefSettings, projects, issues };
});
import { briefService } from "../services/briefs.js";
const companyId = "company-1";
const agentId = "agent-1";
const secretary = { id: agentId, name: "秘书", status: "idle" };
const input = { title: "Brief", body: "Confirmed progress", sourceRefs: ["/ORI/issues/ORI-1"], status: "published" as const };
function database(reads: unknown[][], inserted: unknown[] = []) {
  const where = vi.fn(async () => reads.shift() ?? []);
  const returning = vi.fn(async () => inserted);
  const insertValues = vi.fn(() => ({ onConflictDoNothing: () => ({ returning }), onConflictDoUpdate: vi.fn() }));
  const db = { select: vi.fn(() => ({ from: () => ({ where }) })), insert: vi.fn(() => ({ values: insertValues })) };
  return { db: db as any, insertValues };
}
describe("native brief service", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ agentId }); });
  it("rejects another company project before writing", async () => {
    const { db, insertValues } = database([[]]);
    await expect(briefService(db).create(companyId, agentId, { ...input, projectId: "foreign-project" })).rejects.toMatchObject({ status: 404 });
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("rejects publication by an unconfigured agent", async () => {
    const { db, insertValues } = database([[{ secretaryAgentId: agentId }], [secretary]]);
    await expect(briefService(db).create(companyId, "other-agent", input)).rejects.toMatchObject({ status: 403 });
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("rejects a source issue outside the authenticated company", async () => {
    const { db, insertValues } = database([[{ secretaryAgentId: agentId }], [secretary], []]);
    await expect(briefService(db).create(companyId, agentId, { ...input, issueId: "foreign-issue" })).rejects.toMatchObject({ status: 404 });
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("rejects publication from a terminated secretary", async () => {
    const { db, insertValues } = database([[{ secretaryAgentId: agentId }], [{ ...secretary, status: "terminated" }]]);
    await expect(briefService(db).create(companyId, agentId, input)).rejects.toMatchObject({ status: 403 });
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("rejects a source issue assigned to a different agent", async () => {
    const { db, insertValues } = database([[{ secretaryAgentId: agentId }], [secretary], [{ id: "issue-1", assigneeAgentId: "other-agent" }]]);
    await expect(briefService(db).create(companyId, agentId, { ...input, issueId: "issue-1" })).rejects.toMatchObject({ status: 403 });
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("returns the original record when an issue publication is retried", async () => {
    const stored = { id: "brief-1", ...input };
    const { db } = database([[{ secretaryAgentId: agentId }], [secretary], [{ id: "issue-1", assigneeAgentId: agentId }], [stored]], []);
    await expect(briefService(db).create(companyId, agentId, { ...input, issueId: "issue-1" })).resolves.toEqual(stored);
  });
  it("snapshots the authenticated secretary name for archived authorship", async () => {
    const { db, insertValues } = database([[{ secretaryAgentId: agentId }], [secretary]], [{ id: "brief-1" }]);
    await briefService(db).create(companyId, agentId, input);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ authorAgentId: agentId, authorAgentName: secretary.name }));
  });
  it("creates assigned work and wakes the actual configured secretary", async () => {
    const { db } = database([[{ secretaryAgentId: agentId }], [secretary]]);
    mocks.createIssue.mockResolvedValue({ id: "issue-1" });
    mocks.wakeup.mockResolvedValue({ id: "run-1" });
    await expect(briefService(db).generate(companyId, null, "operator")).resolves.toEqual({ issueId: "issue-1", runId: "run-1", status: "queued" });
    expect(mocks.createIssue).toHaveBeenCalledWith(companyId, expect.objectContaining({ assigneeAgentId: agentId, status: "todo", description: expect.stringContaining("POST /api/companies/company-1/briefs") }));
    expect(mocks.wakeup).toHaveBeenCalledWith(agentId, expect.objectContaining({ payload: { issueId: "issue-1" }, idempotencyKey: "brief-generation:issue-1" }));
  });
  it("does not dispatch work when the secretary is paused", async () => {
    const { db } = database([[{ secretaryAgentId: agentId }], [{ ...secretary, status: "paused" }]]);
    await expect(briefService(db).generate(companyId, null, "operator")).rejects.toMatchObject({ status: 409 });
    expect(mocks.createIssue).not.toHaveBeenCalled(); expect(mocks.wakeup).not.toHaveBeenCalled();
  });
});
