import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { costAccountingOutbox } from "@paperclipai/db";
import { budgetService, type BudgetEnforcementScope } from "./budgets.js";

export type CostAccountingOutboxHooks = {
  cancelWorkForScope: (scope: BudgetEnforcementScope) => Promise<void>;
};

/** Retries committed budget cancellations. The consumer operation is idempotent. */
export function costAccountingOutboxService(db: Db, hooks: CostAccountingOutboxHooks) {
  return {
    sweepPending: async (limit = 100) => {
      const rows = await db.select().from(costAccountingOutbox)
        .where(inArray(costAccountingOutbox.status, ["pending", "retry"]))
        .orderBy(asc(costAccountingOutbox.createdAt)).limit(limit);
      let delivered = 0;
      for (const row of rows) {
        await db.update(costAccountingOutbox).set({ attempts: sql`${costAccountingOutbox.attempts} + 1` })
          .where(eq(costAccountingOutbox.id, row.id));
        try {
          // Legacy intents are revalidated and delivered by the current policy
          // engine, whose version fence preserves work admitted after a grant.
          await budgetService(db, hooks).getInvocationBlock(row.companyId,
            row.scopeType === "agent" ? row.scopeId : null,
            row.scopeType === "project" ? { projectId: row.scopeId } : undefined);
          await db.update(costAccountingOutbox).set({ status: "delivered", deliveredAt: new Date(), lastError: null })
            .where(eq(costAccountingOutbox.id, row.id));
          delivered += 1;
        } catch (error) {
          await db.update(costAccountingOutbox).set({ status: "retry", lastError: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000) })
            .where(eq(costAccountingOutbox.id, row.id));
        }
      }
      return { scanned: rows.length, delivered };
    },
  };
}
