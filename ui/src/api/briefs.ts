import { api } from "./client";
import type { Brief, BriefSettings } from "@paperclipai/shared";

export const briefsKeys = {
  all: (companyId: string) => ["briefs", companyId] as const,
  list: (companyId: string, projectId?: string | null) => ["briefs", companyId, "list", projectId ?? null] as const,
  settings: (companyId: string) => ["briefs", companyId, "settings"] as const,
};

export const briefsApi = {
  list: (companyId: string, projectId?: string | null) =>
    api.get<Brief[]>(`/companies/${companyId}/briefs${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`),
  settings: (companyId: string) => api.get<BriefSettings>(`/companies/${companyId}/briefs/settings`),
  updateSettings: (companyId: string, secretaryAgentId: string | null) =>
    api.patch<BriefSettings>(`/companies/${companyId}/briefs/settings`, { secretaryAgentId }),
  generate: (companyId: string, projectId?: string | null) =>
    api.post<{ issueId: string; status: "queued"; runId?: string }>(`/companies/${companyId}/briefs/generate`, projectId ? { projectId } : {}),
};
