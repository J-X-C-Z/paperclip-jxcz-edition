import { and, eq, asc } from "drizzle-orm";
import { agents, projects, projectAgentMemberships, type Db } from "@paperclipai/db";
import type { UpsertProjectAgentMembership } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

export function projectAgentMembershipService(db: Db) {
  async function assertProject(companyId: string, projectId: string) {
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.companyId, companyId), eq(projects.id, projectId)));
    if (!project) throw notFound("Project not found");
  }
  return {
    async list(companyId: string, projectId: string) {
      await assertProject(companyId, projectId);
      return db.select().from(projectAgentMemberships)
        .where(and(eq(projectAgentMemberships.companyId, companyId), eq(projectAgentMemberships.projectId, projectId)))
        .orderBy(asc(projectAgentMemberships.sortOrder), asc(projectAgentMemberships.createdAt), asc(projectAgentMemberships.id));
    },
    async upsert(companyId: string, projectId: string, input: UpsertProjectAgentMembership) {
      await assertProject(companyId, projectId);
      const [agent] = await db.select({ id: agents.id }).from(agents)
        .where(and(eq(agents.companyId, companyId), eq(agents.id, input.agentId)));
      if (!agent) throw unprocessable("Agent must belong to the project's company");
      const { agentId, ...fields } = input;
      const [membership] = await db.insert(projectAgentMemberships).values({ companyId, projectId, agentId, ...fields })
        .onConflictDoUpdate({ target: [projectAgentMemberships.projectId, projectAgentMemberships.agentId], set: { ...fields, updatedAt: new Date() } })
        .returning();
      return membership!;
    },
    async remove(companyId: string, projectId: string, agentId: string) {
      await assertProject(companyId, projectId);
      const [membership] = await db.delete(projectAgentMemberships)
        .where(and(eq(projectAgentMemberships.companyId, companyId), eq(projectAgentMemberships.projectId, projectId), eq(projectAgentMemberships.agentId, agentId)))
        .returning();
      return membership ?? null;
    },
  };
}
