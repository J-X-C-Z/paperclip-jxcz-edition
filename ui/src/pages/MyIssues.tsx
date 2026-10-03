import { uiText } from "@/i18n";
import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAccountIdentity } from "../api/companies-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { mergeMyIssuePages, myIssuesQueryOptions } from "../lib/my-issues-query";
import { useOptionalProjectScope } from "../context/ProjectScopeContext";
import { Button } from "../components/ui/button";
import { StatusIcon } from "../components/StatusIcon";

import { EntityRow } from "../components/EntityRow";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate } from "../lib/utils";
import { ListTodo } from "lucide-react";
import { useStreamlinedUiEnabled } from "../hooks/useStreamlinedUiEnabled";

export function MyIssues() {
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const identity = useAccountIdentity();
  const scope = useOptionalProjectScope() ?? {
    enabled: false, projectId: null, loading: false, error: null,
  };
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setBreadcrumbs([{ label: uiText("My Tasks") }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery(
    myIssuesQueryOptions({
      companyId: selectedCompanyId, userId: identity.userId, identitySettled: identity.settled,
      scopeEnabled: scope.enabled, projectId: scope.projectId, scopeLoading: scope.loading,
      scopeError: scope.error,
    }),
  );
  const myIssues = useMemo(() => mergeMyIssuePages(data?.pages ?? []).filter(
    (issue) => !issue.assigneeAgentId && !["done", "cancelled"].includes(issue.status),
  ), [data]);
  const loadMore = () => {
    if (!hasNextPage || isFetchingNextPage || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    void fetchNextPage({ cancelRefetch: false }).finally(() => {
      loadingMoreRef.current = false;
    });
  };

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={ListTodo}
        message={streamlinedUiEnabled
          ? "Select an organization to view your tasks."
          : "Select a company to view your tasks."}
      />
    );
  }

  if (scope.error || identity.failed) {
    return <EmptyState icon={ListTodo} message="无法验证账户或项目范围，请刷新后重试。" />;
  }
  if (isLoading || scope.loading || !identity.settled) {
    return <PageSkeleton variant="list" />;
  }
  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!error && myIssues.length === 0 && (
        <EmptyState icon={ListTodo} message="No tasks assigned to you." />
      )}
      {myIssues.length > 0 && (
        <div className="border border-border">
          {myIssues.map((issue) => (
            <EntityRow
              key={issue.id}
              identifier={issue.identifier ?? issue.id.slice(0, 8)}
              title={issue.title}
              to={`/issues/${issue.identifier ?? issue.id}`}
              leading={
                <StatusIcon status={issue.status} externalConversationState={issue.externalConversationState} blockerAttention={issue.blockerAttention} />
              }
              trailing={
                <span className="text-xs text-muted-foreground">
                  {formatDate(issue.createdAt)}
                </span>
              }
            />
          ))}
        </div>
      )}
      {hasNextPage && (
        <Button variant="outline" onClick={loadMore} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? uiText("Loading...") : uiText("Load more")}
        </Button>
      )}
    </div>
  );
}
