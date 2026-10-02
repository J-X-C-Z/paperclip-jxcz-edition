import { useOptionalProjectScope } from "@/context/ProjectScopeContext";

/** Project inherited by new work; explicit dialog defaults may still override it. */
export function useCreationScope() {
  const scope = useOptionalProjectScope();
  if (!scope) return { projectId: null, ready: true };
  return {
    projectId: scope.enabled && !scope.loading && !scope.error ? scope.projectId : null,
    ready: !scope.loading && !(scope.enabled && scope.error),
  };
}
