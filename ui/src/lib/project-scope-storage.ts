const STORAGE_KEY = "paperclip.projectScopeByCompany";
type ScopePreferences = Record<string, string | null>;
type ScopeStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): ScopeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readPreferences(storage: ScopeStorage | null): ScopePreferences {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) =>
      value === null || (typeof value === "string" && value.length > 0)));
  } catch {
    return {};
  }
}

/** Best-effort preferences: a denied/quota-limited storage never breaks navigation. */
export function createProjectScopeStorage(storage: ScopeStorage | null) {
  return {
    read(companyId: string): string | null {
      const preferences = readPreferences(storage);
      return Object.hasOwn(preferences, companyId) ? preferences[companyId] : null;
    },
    write(companyId: string, projectId: string | null): void {
      try {
        const preferences = readPreferences(storage);
        storage?.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, [companyId]: projectId }));
      } catch {
        // The mounted provider retains the preference even if storage is unavailable.
      }
    },
  };
}

export const ProjectScopeStorage = {
  read(companyId: string): string | null {
    return createProjectScopeStorage(browserStorage()).read(companyId);
  },
  write(companyId: string, projectId: string | null): void {
    createProjectScopeStorage(browserStorage()).write(companyId, projectId);
  },
};
