import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@paperclipai/db";

const mocks = vi.hoisted(() => ({ get: vi.fn(), alertSummary: vi.fn(), summary: vi.fn() }));
vi.mock("../services/sidebar-badges.js", () => ({ sidebarBadgeService: () => ({ get: mocks.get }) }));
vi.mock("../services/dashboard.js", () => ({ dashboardService: () => ({ alertSummary: mocks.alertSummary, summary: mocks.summary }) }));
vi.mock("../services/access.js", () => ({ accessService: () => ({}) }));
import { sidebarBadgeRoutes } from "../routes/sidebar-badges.js";

function app(companyId = "company-a") {
  const server = express();
  server.use((req, _res, next) => {
    req.actor = { type: "agent", companyId } as typeof req.actor;
    next();
  });
  server.use(sidebarBadgeRoutes({} as Db));
  server.use((err: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).json({ error: err.message });
  });
  return server;
}

describe("sidebar badge lightweight alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ inbox: 3, approvals: 2, failedRuns: 0, joinRequests: 1 });
    mocks.alertSummary.mockResolvedValue({ agents: { error: 1 }, costs: { monthBudgetCents: 100, monthUtilizationPercent: 80 } });
    mocks.summary.mockRejectedValue(new Error("Full dashboard must not be read"));
  });

  it("keeps badge fields and includes error and 80-percent budget alerts", async () => {
    const response = await request(app()).get("/companies/company-a/sidebar-badges");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ inbox: 5, approvals: 2, failedRuns: 0, joinRequests: 1 });
    expect(mocks.alertSummary).toHaveBeenCalledWith("company-a");
    expect(mocks.summary).not.toHaveBeenCalled();
  });

  it("does not duplicate the error alert when failed runs are present", async () => {
    mocks.get.mockResolvedValue({ inbox: 4, approvals: 2, failedRuns: 1, joinRequests: 1 });
    mocks.alertSummary.mockResolvedValue({ agents: { error: 2 }, costs: { monthBudgetCents: 100, monthUtilizationPercent: 79.99 } });
    const response = await request(app()).get("/companies/company-a/sidebar-badges");
    expect(response.body).toEqual({ inbox: 4, approvals: 2, failedRuns: 1, joinRequests: 1 });
  });

  it("denies cross-company access before reading either summary", async () => {
    const response = await request(app("company-b")).get("/companies/company-a/sidebar-badges");
    expect(response.status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.alertSummary).not.toHaveBeenCalled();
  });
});
