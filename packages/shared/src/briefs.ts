import { z } from "zod";
export interface Brief {
  id: string;
  companyId: string;
  projectId: string | null;
  authorAgentId: string | null;
  authorAgentName: string;
  issueId?: string | null;
  title: string;
  body: string;
  sourceRefs: string[];
  status: string;
  createdAt: string;
}
export interface BriefSettings {
  secretaryAgentId: string | null;
  secretaryAgent: { id: string; name: string; status: string } | null;
  enabled: boolean;
}
export const createBriefSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  issueId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(100_000),
  sourceRefs: z.array(z.string().trim().min(1).max(2_000)).min(1).max(100),
  status: z.enum(["published"]).default("published"),
});
export const generateBriefSchema = z.object({ projectId: z.string().uuid().nullable().optional() });
export const updateBriefSettingsSchema = z.object({ secretaryAgentId: z.string().uuid().nullable() });
export type CreateBrief = z.infer<typeof createBriefSchema>;
