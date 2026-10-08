import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { costAccountingOutboxService } from "../services/cost-accounting-outbox.js";
const { invocationBlock } = vi.hoisted(() => ({ invocationBlock: vi.fn() }));
vi.mock("../services/budgets.js", () => ({ budgetService: () => ({ getInvocationBlock: invocationBlock }) }));

it("revalidates legacy cancellation through current policy enforcement before acknowledging", async () => {
  const row = { id: "legacy", companyId: "company", scopeType: "project", scopeId: "project" };
  const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  const db = { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [row] }) }) }) }), update } as unknown as Db;
  const cancelWorkForScope = vi.fn();
  invocationBlock.mockResolvedValue(null);
  await expect(costAccountingOutboxService(db, { cancelWorkForScope }).sweepPending()).resolves.toEqual({ scanned: 1, delivered: 1 });
  expect(invocationBlock).toHaveBeenCalledExactlyOnceWith("company", null, { projectId: "project" });
  expect(cancelWorkForScope).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledTimes(2);
});
