import type { DashboardSummary } from "@paperclipai/shared";
import { api } from "./client";

export const dashboardApi = {
  summary: (companyId: string, projectId?: string | null) =>
    api.get<DashboardSummary>(`/companies/${companyId}/dashboard${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`),
};
