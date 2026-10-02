import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { notFound } from "../errors.js";
import { goals, projects, projectGoals } from "@paperclipai/db";

type GoalReader = Pick<Db, "select">;

export async function getDefaultCompanyGoal(db: GoalReader, companyId: string) {
  const activeRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        eq(goals.status, "active"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (activeRootGoal) return activeRootGoal;

  const anyRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (anyRootGoal) return anyRootGoal;

  return db
    .select()
    .from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.level, "company")))
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
}

export function goalService(db: Db) {
  return {
    list: (companyId: string, projectId?: string) => db.select().from(goals).where(and(eq(goals.companyId, companyId),
      projectId ? sql`(EXISTS (SELECT 1 FROM ${projectGoals} WHERE ${projectGoals.companyId} = ${companyId}
        AND ${projectGoals.projectId} = ${projectId} AND ${projectGoals.goalId} = ${goals.id})
        OR EXISTS (SELECT 1 FROM ${projects} WHERE ${projects.companyId} = ${companyId}
          AND ${projects.id} = ${projectId} AND ${projects.goalId} = ${goals.id}))` : undefined)),

    getById: (id: string) =>
      db
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .then((rows) => rows[0] ?? null),

    getDefaultCompanyGoal: (companyId: string) => getDefaultCompanyGoal(db, companyId),

    create: async (companyId: string, data: Omit<typeof goals.$inferInsert, "companyId"> & { projectId?: string }) => {
      const { projectId, ...goalData } = data;
      // Preserve existing company creation; project creation and its relation commit together.
      if (!projectId) return db.insert(goals).values({ ...goalData, companyId }).returning().then((rows) => rows[0]);
      return db.transaction(async (tx) => {
        const [project] = await tx.select({ id: projects.id }).from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId))).for("share");
        if (!project) throw notFound("Project not found");
        const [goal] = await tx.insert(goals).values({ ...goalData, companyId }).returning();
        await tx.insert(projectGoals).values({ companyId, projectId, goalId: goal.id });
        return goal;
      });
    },

    update: (id: string, data: Partial<typeof goals.$inferInsert>) =>
      db
        .update(goals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    remove: (id: string) =>
      db
        .delete(goals)
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),
  };
}
