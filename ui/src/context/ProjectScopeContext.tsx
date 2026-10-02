import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "@/api/projects";
import type { Project } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { useProjectWorkspaceEnabled } from "@/hooks/useProjectWorkspaceEnabled";
import { useLocation, useNavigate } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { ProjectScopeStorage } from "@/lib/project-scope-storage";
import { projectScopeFromSearch, projectScopeSearch, resolveProjectScope } from "@/lib/project-scope";

interface ProjectScopeValue {
  enabled: boolean;
  projectId: string | null;
  projects: Project[];
  loading: boolean;
  error: Error | null;
  setProjectId: (projectId: string | null) => void;
}

const ProjectScopeContext = createContext<ProjectScopeValue | null>(null);

export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const { selectedCompanyId } = useCompany();
  const feature = useProjectWorkspaceEnabled();
  const { loaded, error: settingsError } = feature;
  // Keep scope guards active until settings positively confirm feature-off.
  const enabled = feature.enabled || !loaded;
  const location = useLocation();
  const navigate = useNavigate();
  const parsedUrlProject = projectScopeFromSearch(location.search);
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId ?? "__none__", { includeArchived: true }),
    queryFn: () => projectsApi.list(selectedCompanyId!, { includeArchived: true }),
    enabled: loaded && enabled && !!selectedCompanyId,
  });
  const projects = projectsQuery.data ?? [];
  const companyRef = useRef(selectedCompanyId);

  // A project query from the previous company is never accepted as validation
  // for the new company; query keys and resolveProjectScope both enforce that.
  useEffect(() => {
    const previousCompanyId = companyRef.current;
    companyRef.current = selectedCompanyId;
    if (!previousCompanyId || !selectedCompanyId || previousCompanyId === selectedCompanyId) return;
    const saved = ProjectScopeStorage.read(selectedCompanyId);
    navigate({ pathname: location.pathname, search: projectScopeSearch(location.search, saved), hash: location.hash }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, selectedCompanyId]);

  const projectId = !loaded || settingsError || (enabled && projectsQuery.error) ? null : resolveProjectScope({
    enabled,
    companyId: selectedCompanyId,
    urlProjectId: parsedUrlProject,
    savedProjectId: selectedCompanyId ? ProjectScopeStorage.read(selectedCompanyId) : null,
    projects: projectsQuery.data,
  });

  const value = useMemo<ProjectScopeValue>(() => ({
    enabled,
    projectId,
    projects,
    loading: !settingsError && (!loaded || (enabled && !!selectedCompanyId && !projectsQuery.isFetched)),
    error: (settingsError ?? (enabled ? projectsQuery.error : null)) as Error | null,
    setProjectId: (nextProjectId) => {
      if (!selectedCompanyId || !loaded || settingsError || projectsQuery.error) return;
      const validId = nextProjectId && projects.some((project) => project.id === nextProjectId && project.companyId === selectedCompanyId)
        ? nextProjectId
        : null;
      ProjectScopeStorage.write(selectedCompanyId, validId);
      navigate({ pathname: location.pathname, search: projectScopeSearch(location.search, validId), hash: location.hash }, { replace: true });
    },
  }), [enabled, loaded, settingsError, location.hash, location.pathname, location.search, navigate, projectId, projects, projectsQuery.error, projectsQuery.isFetched, projectsQuery.isLoading, selectedCompanyId]);

  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>;
}

export function useProjectScope() {
  const context = useContext(ProjectScopeContext);
  if (!context) throw new Error("useProjectScope must be used within ProjectScopeProvider");
  return context;
}

export function useOptionalProjectScope() {
  return useContext(ProjectScopeContext);
}
