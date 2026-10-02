import { useOptionalProjectScope } from "../context/ProjectScopeContext";

export function useWorkScope() {
  const scope = useOptionalProjectScope();
  return {
    projectId: scope?.enabled ? scope.projectId : null,
    loading: scope?.loading ?? false,
    error: scope?.enabled ? scope.error : null,
    ready: !scope?.loading && !(scope?.enabled && scope.error),
    projects: scope?.projects ?? [],
    clearProject: () => scope?.setProjectId(null),
  };
}
