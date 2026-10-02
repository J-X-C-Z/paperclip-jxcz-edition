import { useUiTranslator } from "@/i18n";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useOptionalProjectScope } from "../context/ProjectScopeContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalTree } from "../components/GoalTree";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Target, Plus } from "lucide-react";

export function Goals() {
  const tr = useUiTranslator();
  const { selectedCompanyId } = useCompany();
  const projectScope = useOptionalProjectScope() ?? {
    enabled: false,
    projectId: null,
    projects: [],
    loading: false,
    error: null,
  };
  const projectId = projectScope.enabled ? projectScope.projectId : null;
  const { openNewGoal } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: tr("Goals") }]);
  }, [setBreadcrumbs, tr]);

  const { data: goals, isLoading, error } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!, projectId),
    queryFn: () => goalsApi.list(selectedCompanyId!, projectId),
    enabled: !!selectedCompanyId && !projectScope.loading && !projectScope.error,
  });
  // The scoped API is authoritative; the project switcher may still cache an older goal relation.

  if (!selectedCompanyId) {
    return <EmptyState icon={Target} message={tr("Select an organization to view goals.")} />;
  }

  if (projectScope.enabled && projectScope.error) {
    return <p role="alert" className="text-sm text-destructive">{projectScope.error.message}</p>;
  }

  if (projectScope.loading || isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {goals && goals.length === 0 && (
        <EmptyState
          icon={Target}
          message={tr("No goals yet.")}
          action={tr("Add Goal")}
          onAction={() => openNewGoal()}
        />
      )}

      {goals && goals.length > 0 && (
        <>
          <div className="flex items-center justify-start">
            <Button size="sm" variant="outline" onClick={() => openNewGoal()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />{tr("New Goal")}</Button>
          </div>
          <GoalTree goals={goals} goalLink={(goal) => `/goals/${goal.id}`} />
        </>
      )}
    </div>
  );
}
