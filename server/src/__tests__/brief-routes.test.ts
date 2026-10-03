import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const companyId = "22222222-2222-4222-8222-222222222222";
const agentId = "11111111-1111-4111-8111-111111111111";
const svc = vi.hoisted(() => ({ list: vi.fn(), settings: vi.fn(), updateSettings: vi.fn(), create: vi.fn(), generate: vi.fn() }));
const canUser = vi.hoisted(() => vi.fn());
vi.mock("../services/briefs.js", () => ({ briefService: () => svc }));
vi.mock("../services/access.js", () => ({ accessService: () => ({ canUser }) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: vi.fn() }));
import { briefRoutes } from "../routes/briefs.js";
import { errorHandler } from "../middleware/error-handler.js";
function app(actor: object) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { (req as any).actor = actor; next(); });
  instance.use("/api", briefRoutes({} as any));
  instance.use(errorHandler);
  return instance;
}
const board = { type: "board", userId: "operator", source: "local_implicit" };
const agent = { type: "agent", agentId, companyId };
const payload = { title: "工作简报", body: "已完成一项工作。", sourceRefs: ["/ORI/issues/ORI-1"] };
describe("native brief routes", () => {
  beforeEach(() => { vi.clearAllMocks(); canUser.mockResolvedValue(true); svc.create.mockResolvedValue({ id: "brief-1", ...payload }); svc.generate.mockResolvedValue({ issueId: "issue-1", status: "queued", runId: "run-1" }); });
  it("derives the author from agent authentication, ignoring forged body identity", async () => {
    const result = await request(app(agent)).post(`/api/companies/${companyId}/briefs`).send({ ...payload, authorAgentId: "forged" });
    expect(result.status).toBe(201);
    expect(svc.create).toHaveBeenCalledWith(companyId, agentId, { ...payload, status: "published" });
  });
  it("prevents agents from crossing company scope before querying records", async () => {
    const result = await request(app({ ...agent, companyId: "another" })).get(`/api/companies/${companyId}/briefs`);
    expect(result.status).toBe(403); expect(svc.list).not.toHaveBeenCalled();
  });
  it("does not let an operator impersonate a generating secretary", async () => {
    const result = await request(app(board)).post(`/api/companies/${companyId}/briefs`).send(payload);
    expect(result.status).toBe(403); expect(svc.create).not.toHaveBeenCalled();
  });
  it("requires source evidence and rejects empty output", async () => {
    const result = await request(app(agent)).post(`/api/companies/${companyId}/briefs`).send({ ...payload, sourceRefs: [] });
    expect(result.status).toBe(400); expect(svc.create).not.toHaveBeenCalled();
  });
  it("queues generation as real work and returns its issue reference", async () => {
    const result = await request(app(board)).post(`/api/companies/${companyId}/briefs/generate`).send({});
    expect(result.status).toBe(202); expect(result.body.issueId).toBe("issue-1"); expect(svc.generate).toHaveBeenCalledWith(companyId, undefined, "operator");
  });
  it("does not permit agents to reconfigure or trigger the secretary", async () => {
    const result = await request(app(agent)).patch(`/api/companies/${companyId}/briefs/settings`).send({ secretaryAgentId: agentId });
    expect(result.status).toBe(403); expect(svc.updateSettings).not.toHaveBeenCalled();
  });
});
