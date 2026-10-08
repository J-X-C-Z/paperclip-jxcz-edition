import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, modelSwitchProfiles } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { modelSwitchRoutes } from "../routes/model-switch.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres model switch route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("model switch profile routes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-model-switch-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(modelSwitchProfiles);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Model Switch Co",
      issuePrefix: `M${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
      defaultResponsibleUserId: "responsible-user",
    });
    return companyId;
  }

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const userId = "board-user";
      (req as any).actor = {
        type: "board",
        userId,
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "owner", status: "active", principalId: userId }],
        source: "local_implicit",
        isInstanceAdmin: true,
      };
      next();
    });
    app.use("/api", modelSwitchRoutes(db));
    app.use(errorHandler);
    return app;
  }

  it("serves the two built-in presets with leadership title overrides", async () => {
    await seedCompany();
    const response = await request(createApp()).get(`/api/companies/${companyId}/model-switch/profiles`);
    expect(response.status).toBe(200);
    expect(response.body.builtIns).toHaveLength(2);
    const [codex, mimo] = response.body.builtIns;
    expect(codex).toMatchObject({
      name: "全部 Codex · GPT-6",
      builtIn: true,
      profile: {
        default: { adapterType: "codex_local", model: "gpt-6-luna" },
      },
    });
    expect(codex.profile.titles["组长"]).toEqual({ adapterType: "codex_local", model: "gpt-6.1-sol" });
    expect(codex.profile.titles["部长"]).toEqual({ adapterType: "codex_local", model: "gpt-6.1-sol" });
    expect(codex.profile.titles["经理"]).toEqual({ adapterType: "codex_local", model: "gpt-6.1-sol" });
    expect(mimo).toMatchObject({
      name: "全部 MiMo Code · V2.6",
      builtIn: true,
      profile: {
        default: { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-flash" },
      },
    });
    expect(mimo.profile.titles["组长"]).toMatchObject({
      adapterType: "mimocode_local",
      model: "mimo/mimo-v2.6-pro",
    });
  });

  it("saves, upserts by name, lists, and deletes profiles", async () => {
    await seedCompany();
    const app = createApp();
    const payload = {
      name: "夜间 Flash",
      profile: {
        default: { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-flash" },
        titles: { 组长: { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-flash" } },
      },
    };
    const created = await request(app).post(`/api/companies/${companyId}/model-switch/profiles`).send(payload);
    expect(created.status).toBe(201);

    const replaced = await request(app)
      .post(`/api/companies/${companyId}/model-switch/profiles`)
      .send({ ...payload, profile: { ...payload.profile, default: { adapterType: "codex_local", model: "gpt-6-luna" } } });
    expect(replaced.status).toBe(201);

    const listed = await request(app).get(`/api/companies/${companyId}/model-switch/profiles`);
    expect(listed.body.saved).toHaveLength(1);
    expect(listed.body.saved[0]).toMatchObject({
      name: "夜间 Flash",
      builtIn: false,
      profile: { default: { adapterType: "codex_local", model: "gpt-6-luna" } },
    });

    const removed = await request(app).delete(
      `/api/companies/${companyId}/model-switch/profiles/${listed.body.saved[0].id}`,
    );
    expect(removed.status).toBe(204);
    const after = await request(app).get(`/api/companies/${companyId}/model-switch/profiles`);
    expect(after.body.saved).toHaveLength(0);

    const missing = await request(app).delete(
      `/api/companies/${companyId}/model-switch/profiles/${randomUUID()}`,
    );
    expect(missing.status).toBe(404);
  });

  it("rejects overwriting built-in profile names", async () => {
    await seedCompany();
    const response = await request(createApp())
      .post(`/api/companies/${companyId}/model-switch/profiles`)
      .send({
        name: "builtin:0",
        profile: { default: { adapterType: "codex_local", model: "gpt-6-luna" }, titles: {} },
      });
    expect(response.status).toBe(422);
  });
});
