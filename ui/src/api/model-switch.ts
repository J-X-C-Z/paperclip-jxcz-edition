import type { ModelSwitchProfile, ModelSwitchProfileData } from "@paperclipai/shared";
import { api } from "./client";

export interface ModelSwitchProfileEntry {
  /** Stable id: `builtin:<n>` for built-ins, a UUID for saved profiles. */
  id: string;
  name: string;
  profile: ModelSwitchProfile;
  builtIn: boolean;
  updatedAt?: string;
}

export interface ModelSwitchProfilesResponse {
  builtIns: ModelSwitchProfileEntry[];
  saved: ModelSwitchProfileEntry[];
}

export const modelSwitchApi = {
  profiles: (companyId: string) =>
    api.get<ModelSwitchProfilesResponse>(
      `/companies/${encodeURIComponent(companyId)}/model-switch/profiles`,
    ),
  saveProfile: (companyId: string, name: string, profile: ModelSwitchProfileData) =>
    api.post<{ id: string; name: string }>(
      `/companies/${encodeURIComponent(companyId)}/model-switch/profiles`,
      { name, profile },
    ),
  deleteProfile: (companyId: string, profileId: string) =>
    api.delete<void>(
      `/companies/${encodeURIComponent(companyId)}/model-switch/profiles/${encodeURIComponent(profileId)}`,
    ),
};
