import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { saveModelSwitchProfileSchema } from "@paperclipai/shared";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { notFound, unprocessable } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { modelSwitchProfileService } from "../services/model-switch.js";

/**
 * Model switch ("模型") surface: named model-switch profiles ("配置文件") plus
 * the built-in one-click presets. Applying a profile is a loop of the existing
 * agent PATCH calls from the UI, so every agent-config guard stays in one place.
 */
export function modelSwitchRoutes(db: Db) {
  const router = Router();
  const svc = modelSwitchProfileService(db);

  router.get("/companies/:companyId/model-switch/profiles", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    res.json({
      builtIns: svc.builtIns().map((profile, index) => ({ id: `builtin:${index}`, name: profile.name, profile, builtIn: true })),
      saved: (await svc.list(companyId)).map((row) => ({ ...row, builtIn: false })),
    });
  });

  router.post(
    "/companies/:companyId/model-switch/profiles",
    validate(saveModelSwitchProfileSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertBoard(req);
      assertCompanyAccess(req, companyId);
      const input = saveModelSwitchProfileSchema.parse(req.body);
      if (input.name.startsWith("builtin:"))
        throw unprocessable("Built-in profiles cannot be overwritten");
      const row = await svc.save(companyId, input.name, input.profile);
      res.status(201).json(row);
    },
  );

  router.delete("/companies/:companyId/model-switch/profiles/:profileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const removed = await svc.remove(companyId, req.params.profileId as string);
    if (!removed) throw notFound("Profile not found");
    res.status(204).end();
  });

  return router;
}
