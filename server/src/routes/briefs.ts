import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createBriefSchema, generateBriefSchema, updateBriefSettingsSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { forbidden } from "../errors.js";
import { briefService } from "../services/briefs.js";
import { accessService } from "../services/access.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function briefRoutes(db: Db) {
  const router = Router();
  const svc = briefService(db);
  const access = accessService(db);
  async function assertCanAssign(req: Parameters<typeof assertCompanyAccess>[0], companyId: string) {
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
    if (!await access.canUser(companyId, req.actor.userId, "tasks:assign")) throw forbidden("Missing permission: tasks:assign");
  }
  router.get("/companies/:companyId/briefs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { projectId } = generateBriefSchema.parse({ projectId: req.query.projectId });
    res.json(await svc.list(companyId, projectId));
  });
  router.get("/companies/:companyId/briefs/settings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.settings(companyId));
  });
  router.patch("/companies/:companyId/briefs/settings", validate(updateBriefSettingsSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanAssign(req, companyId);
    const result = await svc.updateSettings(companyId, req.body.secretaryAgentId);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, action: "brief.settings_updated", entityType: "company", entityId: companyId, details: { secretaryAgentId: result.secretaryAgentId } });
    res.json(result);
  });
  router.post("/companies/:companyId/briefs", validate(createBriefSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (req.actor.type !== "agent" || !req.actor.agentId) throw forbidden("Agent authentication required to publish a brief");
    const brief = await svc.create(companyId, req.actor.agentId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId, action: "brief.published", entityType: "brief", entityId: brief.id, details: { projectId: brief.projectId, title: brief.title } });
    res.status(201).json(brief);
  });
  router.post("/companies/:companyId/briefs/generate", validate(generateBriefSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanAssign(req, companyId);
    const actor = getActorInfo(req);
    const result = await svc.generate(companyId, req.body.projectId, req.actor.userId ?? null);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, action: "brief.generation_requested", entityType: "issue", entityId: result.issueId, details: { projectId: req.body.projectId ?? null, runId: result.runId } });
    res.status(202).json(result);
  });
  return router;
}
