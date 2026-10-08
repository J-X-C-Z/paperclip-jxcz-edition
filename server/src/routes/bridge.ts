import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { agents, goals, issues, projects } from "@paperclipai/db";
import {
  bridgeQuerySchema,
  bridgeUsageQuerySchema,
  createBridgeBindingRevisionSchema,
  createBridgeBindingSchema,
} from "@paperclipai/shared";
import { badRequest, notFound } from "../errors.js";
import { logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { bridgeStorage } from "../services/bridge-storage.js";

export function bridgeRoutes(db: Db) {
  const router = Router();
  const storage = bridgeStorage(db);

  async function assertReferences(companyId: string, input: {
    agentId?: string | null;
    projectId?: string | null;
    issueId?: string | null;
    goalId?: string | null;
  }) {
    if (input.agentId) {
      const [row] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, input.agentId), eq(agents.companyId, companyId))).limit(1);
      if (!row) throw badRequest("agentId does not belong to this company");
    }
    if (input.projectId) {
      const [row] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.companyId, companyId))).limit(1);
      if (!row) throw badRequest("projectId does not belong to this company");
    }
    if (input.issueId) {
      const [row] = await db.select({ id: issues.id }).from(issues).where(and(eq(issues.id, input.issueId), eq(issues.companyId, companyId))).limit(1);
      if (!row) throw badRequest("issueId does not belong to this company");
    }
    if (input.goalId) {
      const [row] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.companyId, companyId))).limit(1);
      if (!row) throw badRequest("goalId does not belong to this company");
    }
  }

  function assertBindingTarget(kind: string, input: {
    agentId?: string | null;
    projectId?: string | null;
    issueId?: string | null;
    goalId?: string | null;
    conversationId?: string | null;
  }) {
    const required: Record<string, string | null | undefined> = {
      agent: input.agentId,
      project: input.projectId,
      issue: input.issueId,
      goal: input.goalId,
      conversation: input.conversationId,
      accounting_owner: input.agentId,
    };
    if (!required[kind]) throw badRequest(`binding kind '${kind}' requires its matching target reference`);
  }

  async function audit(req: Request, companyId: string, action: string, bindingId: string, details: Record<string, unknown>) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action,
      entityType: "bridge_binding",
      entityId: bindingId,
      agentId: actor.agentId,
      runId: actor.runId,
      details,
    });
  }

  router.get("/companies/:companyId/bridge/bindings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = bridgeQuerySchema.parse(req.query);
    res.json(await storage.listBindings(companyId, query));
  });

  router.post("/companies/:companyId/bridge/bindings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const input = createBridgeBindingSchema.parse(req.body);
    assertBindingTarget(input.bindingKind, input);
    await assertReferences(companyId, input);
    const result = await storage.createBinding(companyId, input);
    await audit(req, companyId, "bridge.binding_created", result.id, { kind: input.bindingKind, revision: 1 });
    res.status(201).json(result);
  });

  router.post("/companies/:companyId/bridge/bindings/:bindingId/revisions", async (req, res) => {
    const companyId = req.params.companyId as string;
    const bindingId = req.params.bindingId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const input = createBridgeBindingRevisionSchema.parse(req.body);
    await assertReferences(companyId, input);
    const binding = await storage.getBinding(companyId, bindingId);
    if (!binding) throw notFound("Bridge binding not found");
    assertBindingTarget(binding.bindingKind, input);
    const result = await storage.createRevision(companyId, bindingId, input);
    if (!result) throw notFound("Bridge binding not found");
    await audit(req, companyId, "bridge.binding_revision_created", bindingId, { revision: result.currentRevision });
    res.status(201).json(result);
  });

  router.get("/companies/:companyId/bridge/bindings/:bindingId/revisions", async (req, res) => {
    const companyId = req.params.companyId as string;
    const bindingId = req.params.bindingId as string;
    assertCompanyAccess(req, companyId);
    const revisions = await storage.listRevisions(companyId, bindingId);
    const found = await storage.readRevision(companyId, bindingId, revisions[0]?.revision ?? 0);
    if (!found) throw notFound("Bridge binding not found");
    res.json({ items: revisions });
  });

  router.get("/companies/:companyId/bridge/bindings/:bindingId/revisions/:revision", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const revision = Number.parseInt(req.params.revision as string, 10);
    if (!Number.isInteger(revision) || revision < 1) throw badRequest("revision must be a positive integer");
    const result = await storage.readRevision(companyId, req.params.bindingId as string, revision);
    if (!result) throw notFound("Bridge binding revision not found");
    res.json(result);
  });

  router.get("/companies/:companyId/bridge/snapshots", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = bridgeQuerySchema.parse(req.query);
    res.json(await storage.listSnapshots(companyId, { bindingId: query.bindingId, key: typeof req.query.key === "string" ? req.query.key : undefined, limit: query.limit, cursor: query.cursor }));
  });

  router.get("/companies/:companyId/bridge/events", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = bridgeQuerySchema.parse(req.query);
    res.json(await storage.listEvents(companyId, {
      bindingId: query.bindingId,
      eventKind: query.eventKind,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    }));
  });

  router.get("/companies/:companyId/bridge/events/:eventId/receipts", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ items: await storage.listReceipts(companyId, req.params.eventId as string) });
  });

  router.get("/companies/:companyId/bridge/conversations", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = bridgeQuerySchema.parse(req.query);
    await assertReferences(companyId, query);
    res.json(await storage.listConversations(companyId, {
      agentId: query.agentId,
      projectId: query.projectId,
      issueId: query.issueId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    }));
  });

  router.get("/companies/:companyId/bridge/conversations/:conversationId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await storage.readConversation(companyId, req.params.conversationId as string);
    if (!result) throw notFound("Bridge conversation not found");
    res.json(result);
  });

  router.post("/companies/:companyId/bridge/bindings/:bindingId/snapshots", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const bindingId = req.params.bindingId as string;
    const input = z.object({ revision: z.number().int().positive(), key: z.string().min(1).max(128),
      payload: z.record(z.string(), z.unknown()), tombstone: z.boolean().optional() }).strict().parse(req.body);
    const result = await storage.publishSnapshot({ companyId, bindingId, bindingRevision: input.revision,
      snapshotKey: input.key, payload: input.payload, tombstone: input.tombstone });
    await audit(req, companyId, "bridge.snapshot_published", bindingId, { key: input.key, revision: input.revision, version: result.version });
    res.status(201).json(result);
  });

  router.get("/companies/:companyId/bridge/usage", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = bridgeUsageQuerySchema.parse(req.query);
    await assertReferences(companyId, query);
    res.json(await storage.listUsage(companyId, {
      agentId: query.agentId,
      projectId: query.projectId,
      issueId: query.issueId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      granularity: query.groupBy,
      limit: query.limit,
      cursor: query.cursor,
    }));
  });

  return router;
}
