import type { PreviewMode, ProjectSnapshot } from "../brief-types.js";
import { exampleProjects, orialisWorkspacePreview } from "./preview-data.js";

export interface BriefRepository {
  listProjects(mode: PreviewMode, attempt: number): Promise<ProjectSnapshot[]>;
}

/** Replace this provider with the Paperclip Brief API when that API is available. */
export const previewBriefRepository: BriefRepository = {
  async listProjects(mode, attempt) {
    if (mode === "error" && attempt === 0) throw new Error("The preview provider could not load the Brief data.");
    if (mode === "empty") return [];
    if (mode === "examples") return exampleProjects;
    if (mode === "error" && attempt > 0) return [orialisWorkspacePreview];
    return [orialisWorkspacePreview];
  },
};
