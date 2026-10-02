import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, projects, activityLog, companyMemberships, createDb } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { projectRoutes } from "../routes/projects.js";
import { projectAgentMembershipService } from "../services/project-agent-memberships.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDb = support.supported ? describe : describe.skip;
if (!support.supported) console.warn(`Membership integration tests skipped: ${support.reason}`);

describeDb("project agent memberships", () => {
  let db: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-team-");
    db = createDb(tempDb.connectionString);
  }, 60_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  function app(actor: Express.Request["actor"]) {
    const result = express();
    result.use(express.json());
    result.use((req, _res, next) => { req.actor = actor; next(); });
    result.use("/api", projectRoutes(db));
    result.use(errorHandler);
    return result;
  }
  function board(companyId: string, viewer = false): Express.Request["actor"] {
    return { type: "board", userId: viewer ? "team-viewer" : "team-test", source: "session", companyIds: [companyId],
      memberships: [{ companyId, membershipRole: viewer ? "viewer" : "admin", status: "active" }] };
  }
  async function seed() {
    const [company, foreign] = await db.insert(companies).values([
      { name: "Team", issuePrefix: `T${randomUUID().slice(0, 6)}` },
      { name: "Foreign", issuePrefix: `F${randomUUID().slice(0, 6)}` },
    ]).returning();
    await db.insert(companyMemberships).values([
      { companyId: company.id, principalType: "user", principalId: "team-test", membershipRole: "admin" },
      { companyId: company.id, principalType: "user", principalId: "team-viewer", membershipRole: "viewer" },
    ]);
    const [a, b] = await db.insert(projects).values([
      { companyId: company.id, name: "A" }, { companyId: company.id, name: "B" },
    ]).returning();
    const [x, y] = await db.insert(agents).values([
      { companyId: company.id, name: "X" }, { companyId: company.id, name: "Y" },
    ]).returning();
    const [z, outsider] = await db.insert(agents).values([
      { companyId: company.id, name: "Z", reportsTo: x.id },
      { companyId: foreign.id, name: "Outsider" },
    ]).returning();
    return { company, foreign, a, b, x, y, z, outsider };
  }

  it("X→A, Y→B, Z→A+B; removal preserves B, agent Z and company reporting", async () => {
    const { company, a, b, x, y, z } = await seed();
    const api = app(board(company.id));
    for (const [project, agent] of [[a, x], [b, y], [a, z], [b, z]]) {
      const response = await request(api).put(`/api/projects/${project.id}/agent-memberships`).send({ agentId: agent.id });
      expect(response.status).toBe(200);
    }
    expect((await request(api).get(`/api/projects/${a.id}/agent-memberships`)).body.map((m: {agentId: string}) => m.agentId).sort()).toEqual([x.id, z.id].sort());
    const updated = await request(api).put(`/api/projects/${a.id}/agent-memberships`).send({ agentId: z.id, projectRole: "Reviewer", isLead: true, sortOrder: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ projectRole: "Reviewer", isLead: true, sortOrder: 1 });
    // Retrying an add/update cannot create another link; omitted fields remain intact.
    const retry = await request(api).put(`/api/projects/${a.id}/agent-memberships`).send({ agentId: z.id });
    expect(retry.body.id).toBe(updated.body.id);
    expect(retry.body.projectRole).toBe("Reviewer");
    expect((await request(api).get(`/api/projects/${a.id}/agent-memberships`)).body).toHaveLength(2);
    expect((await request(api).delete(`/api/projects/${a.id}/agent-memberships/${z.id}`)).body.removed).toBe(true);
    expect((await request(api).delete(`/api/projects/${a.id}/agent-memberships/${z.id}`)).body.removed).toBe(false);
    expect((await request(api).get(`/api/projects/${b.id}/agent-memberships`)).body.map((m: {agentId: string}) => m.agentId).sort()).toEqual([y.id, z.id].sort());
    const [unchanged] = await db.select().from(agents).where(eq(agents.id, z.id));
    expect(unchanged).toEqual(z);
    const audit = await db.select().from(activityLog).where(eq(activityLog.entityId, a.id));
    expect(audit.filter((row) => row.action === "project.agent_membership_removed")).toHaveLength(1);
    expect(audit.some((row) => row.action === "project.agent_membership_upserted" && row.actorId === "team-test")).toBe(true);
  });

  it("rejects foreign or missing agents without inserting a link", async () => {
    const { company, a, outsider } = await seed();
    const api = app(board(company.id));
    for (const agentId of [outsider.id, randomUUID()]) {
      expect((await request(api).put(`/api/projects/${a.id}/agent-memberships`).send({ agentId })).status).toBe(422);
    }
    expect((await request(api).get(`/api/projects/${a.id}/agent-memberships`)).body).toEqual([]);
    await expect(projectAgentMembershipService(db).upsert(outsider.companyId, a.id, { agentId: outsider.id })).rejects.toMatchObject({ status: 404 });
  });

  it("enforces board mutation authority, read-only viewers and cross-company isolation", async () => {
    const { company, foreign, a, x } = await seed();
    const agent: Express.Request["actor"] = { type: "agent", agentId: x.id, companyId: company.id, source: "api_key" };
    expect((await request(app(agent)).get(`/api/projects/${a.id}/agent-memberships`)).status).toBe(200);
    expect((await request(app(agent)).put(`/api/projects/${a.id}/agent-memberships`).send({ agentId: x.id })).status).toBe(403);
    expect((await request(app(agent)).delete(`/api/projects/${a.id}/agent-memberships/${x.id}`)).status).toBe(403);
    const viewer = app(board(company.id, true));
    expect((await request(viewer).get(`/api/projects/${a.id}/agent-memberships`)).status).toBe(200);
    expect((await request(viewer).put(`/api/projects/${a.id}/agent-memberships`).send({ agentId: x.id })).status).toBe(403);
    expect((await request(viewer).delete(`/api/projects/${a.id}/agent-memberships/${x.id}`)).status).toBe(403);
    const foreignBoard = app(board(foreign.id));
    expect((await request(foreignBoard).put(`/api/projects/${a.id}/agent-memberships`).send({ agentId: x.id })).status).toBe(404);
    expect((await request(foreignBoard).delete(`/api/projects/${a.id}/agent-memberships/${x.id}`)).status).toBe(404);
    for (const actor of [board(foreign.id), { ...agent, companyId: foreign.id }]) {
      expect((await request(app(actor)).get(`/api/projects/${a.id}/agent-memberships`)).status).toBe(404);
    }
  });

  it("project deletion cascades only participation links and preserves shared agents", async () => {
    const { company, a, b, z } = await seed();
    const service = projectAgentMembershipService(db);
    await service.upsert(company.id, a.id, { agentId: z.id });
    await service.upsert(company.id, b.id, { agentId: z.id });
    await db.delete(projects).where(eq(projects.id, a.id));
    expect(await service.list(company.id, b.id)).toHaveLength(1);
    const [unchanged] = await db.select().from(agents).where(eq(agents.id, z.id));
    expect(unchanged).toEqual(z);
    await expect(service.list(company.id, a.id)).rejects.toMatchObject({ status: 404 });
  });

  it("validates roles, sort order and prevents arbitrary fields", async () => {
    const { company, a, x } = await seed();
    const api = app(board(company.id));
    for (const body of [{ agentId: "bad" }, { agentId: x.id, sortOrder: -1 }, { agentId: x.id, reportsTo: x.id }, { agentId: x.id, projectRole: " " }]) {
      expect((await request(api).put(`/api/projects/${a.id}/agent-memberships`).send(body)).status).toBe(400);
    }
  });
});
