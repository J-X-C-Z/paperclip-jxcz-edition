/** Project scope is a work preference. Company access is still authoritative. */
export interface ScopeProject {
  id: string;
  companyId: string;
  name?: string;
}

export function resolveProjectScope(input: {
  enabled: boolean;
  companyId: string | null;
  /** undefined = no URL override; null = explicit All Company (?project=). */
  urlProjectId: string | null | undefined;
  savedProjectId: string | null;
  /** undefined means validation has not succeeded yet. */
  projects: readonly ScopeProject[] | undefined;
}): string | null {
  if (!input.enabled || !input.companyId || !input.projects) return null;
  const candidate = input.urlProjectId === undefined
    ? input.savedProjectId
    : input.urlProjectId;
  if (!candidate) return null;
  return input.projects.some((project) =>
    project.id === candidate && project.companyId === input.companyId)
    ? candidate
    : null;
}

export function projectScopeFromSearch(search: string): string | null | undefined {
  const params = new URLSearchParams(search);
  if (!params.has("project")) return undefined;
  return params.get("project")?.trim() || null;
}

/** Preserve all unrelated URL parameters; an empty value overrides a saved project. */
export function projectScopeSearch(search: string, projectId: string | null): string {
  const params = new URLSearchParams(search);
  params.set("project", projectId ?? "");
  return `?${params.toString()}`;
}
