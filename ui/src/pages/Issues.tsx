import { useUiTranslator } from "@/i18n";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useLocation, useSearchParams } from "@/lib/router";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { collectLiveIssueIds } from "../lib/liveIssueIds";
import { usePublishSharedQueryData, useSharedPollingQuery } from "@/hooks/useSharedPolling";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { CircleDot } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { useStreamlinedUiEnabled } from "../hooks/useStreamlinedUiEnabled";
import { useOptionalProjectScope } from "../context/ProjectScopeContext";

const ISSUES_PAGE_SIZE = 30;
export const ISSUES_ROW_PRESENTATION = "task" as const;
export const ISSUES_TOOLBAR_PRESENTATION = "collection" as const;

export function resolveIssuesPresentation(streamlinedUiEnabled: boolean) {
  return streamlinedUiEnabled
    ? { rowPresentation: ISSUES_ROW_PRESENTATION, toolbarPresentation: ISSUES_TOOLBAR_PRESENTATION }
    : { rowPresentation: "legacy" as const, toolbarPresentation: "legacy" as const };
}

export function getNextIssuesPageOffset(
  loadedPageSize: number,
  currentOffset: number,
  pageSize: number = ISSUES_PAGE_SIZE,
): number | undefined {
  return loadedPageSize >= pageSize ? currentOffset + pageSize : undefined;
}

export function mergeIssuePagesStable<T extends { id: string }>(pages: T[][]): T[] {
  const seenIssueIds = new Set<string>();
  const merged: T[] = [];

  for (const page of pages) {
    for (const issue of page) {
      if (seenIssueIds.has(issue.id)) continue;
      seenIssueIds.add(issue.id);
      merged.push(issue);
    }
  }

  return merged;
}

export function buildIssuesSearchUrl(currentHref: string, search: string): string | null {
  const url = new URL(currentHref);
  const currentSearch = url.searchParams.get("q") ?? "";
  if (currentSearch === search) return null;

  if (search.length > 0) {
    url.searchParams.set("q", search);
  } else {
    url.searchParams.delete("q");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function Issues() {
  const tr = useUiTranslator();
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  const issuesPresentation = resolveIssuesPresentation(streamlinedUiEnabled);
  const { selectedCompanyId } = useCompany();
  const projectScope = useOptionalProjectScope() ?? {
    enabled: false, projectId: null, loading: false, error: null,
  };
  const { setBreadcrumbs } = useBreadcrumbs();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fetchNextPageInFlightRef = useRef(false);

  const urlSearch = searchParams.get("q") ?? "";
  const [searchOverride, setSearchOverride] = useState<{ search: string; locationSearch: string } | null>(null);
  const syncedSearch = useMemo(() => {
    if (typeof window !== "undefined" && searchOverride?.locationSearch === window.location.search) {
      return searchOverride.search;
    }
    return urlSearch;
  }, [searchOverride, urlSearch, location.search]);
  const participantAgentId = searchParams.get("participantAgentId") ?? undefined;
  const initialWorkspaces = searchParams.getAll("workspace").filter((workspaceId) => workspaceId.length > 0);
  const workspaceIdFilter = initialWorkspaces.length === 1 ? initialWorkspaces[0] : undefined;
  const handleSearchChange = useCallback((search: string) => {
    const nextUrl = buildIssuesSearchUrl(window.location.href, search);
    if (!nextUrl) {
      setSearchOverride(null);
      return;
    }
    window.history.replaceState(window.history.state, "", nextUrl);
    setSearchOverride({ search, locationSearch: window.location.search });
  }, []);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!, { includeArchived: true }),
    queryFn: () => projectsApi.list(selectedCompanyId!, { includeArchived: true }),
    enabled: !!selectedCompanyId,
  });

  const liveRunsQueryKey = queryKeys.liveRuns(selectedCompanyId!);
  const sharedLiveRuns = useSharedPollingQuery({
    companyId: selectedCompanyId,
    resourceKey: "live-runs",
    queryKey: liveRunsQueryKey,
    enabled: !!selectedCompanyId,
    // Event-sourced via LiveUpdatesProvider (GitHub issue 9627); no interval poll needed.
    refetchInterval: false,
    leaderOnly: true,
  });
  const { data: liveRuns, dataUpdatedAt: liveRunsUpdatedAt } = useQuery({
    queryKey: liveRunsQueryKey,
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: sharedLiveRuns.enabled,
    refetchInterval: sharedLiveRuns.refetchInterval,
  });
  usePublishSharedQueryData(sharedLiveRuns, liveRuns, liveRunsUpdatedAt);

  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        "Tasks",
        `${location.pathname}${location.search}${location.hash}`,
        "issues",
      ),
    [location.pathname, location.search, location.hash],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: tr("Tasks") }]);
  }, [setBreadcrumbs, tr]);

  const issuePageSize = ISSUES_PAGE_SIZE;

  const {
    data: issuePages,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [
      ...(projectScope.enabled && projectScope.projectId
        ? queryKeys.issues.listByProject(selectedCompanyId ?? "__none__", projectScope.projectId)
        : queryKeys.issues.list(selectedCompanyId ?? "__none__")),
      "participant-agent",
      participantAgentId ?? "__all__",
      "workspace",
      workspaceIdFilter ?? "__all__",
      "compact",
      "with-routine-executions",
      "infinite",
      issuePageSize,
    ],
    queryFn: ({ pageParam, signal }) => issuesApi.listCompact(selectedCompanyId!, {
      participantAgentId,
      workspaceId: workspaceIdFilter,
      projectId: projectScope.enabled ? projectScope.projectId ?? undefined : undefined,
      includeRoutineExecutions: true,
      limit: issuePageSize,
      offset: pageParam,
      sortField: "updated",
      sortDir: "desc",
    }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      getNextIssuesPageOffset(lastPage.length, lastPageParam, issuePageSize),
    enabled: !!selectedCompanyId && !projectScope.loading && !projectScope.error,
  });

  const issues = useMemo(() => mergeIssuePagesStable(issuePages?.pages ?? []) as Issue[], [issuePages]);
  const liveIssueIds = useMemo(() => collectLiveIssueIds(liveRuns, issues), [issues, liveRuns]);
  const hasMoreServerIssues = syncedSearch.trim().length === 0
    && hasNextPage === true;
  const loadMoreServerIssues = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || fetchNextPageInFlightRef.current) return;
    fetchNextPageInFlightRef.current = true;
    void fetchNextPage({ cancelRefetch: false }).finally(() => {
      fetchNextPageInFlightRef.current = false;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={CircleDot}
        message={streamlinedUiEnabled
          ? tr("Select an organization to view tasks.")
          : tr("Select a company to view tasks.")}
      />
    );
  }

  if (projectScope.enabled && projectScope.loading) {
    return <EmptyState icon={CircleDot} message="正在验证项目范围…" />;
  }
  if (projectScope.enabled && projectScope.error) {
    return <EmptyState icon={CircleDot} message="无法验证项目范围，请刷新后重试。" />;
  }

  return (
    <IssuesList
      key={projectScope.enabled ? `${selectedCompanyId}:${projectScope.projectId ?? "company"}` : "company"}
      projectId={projectScope.enabled ? projectScope.projectId ?? undefined : undefined}
      issues={issues ?? []}
      isLoading={isLoading}
      isLoadingMoreIssues={isFetchingNextPage}
      error={error as Error | null}
      agents={agents}
      projects={projects}
      liveIssueIds={liveIssueIds}
      viewStateKey={projectScope.enabled ? `paperclip:issues-view:${selectedCompanyId}:${projectScope.projectId ?? "company"}` : "paperclip:issues-view"}
      rowPresentation={issuesPresentation.rowPresentation}
      toolbarPresentation={issuesPresentation.toolbarPresentation}
      issueLinkState={issueLinkState}
      initialAssignees={searchParams.get("assignee") ? [searchParams.get("assignee")!] : undefined}
      initialWorkspaces={initialWorkspaces.length > 0 ? initialWorkspaces : undefined}
      initialSearch={syncedSearch}
      onSearchChange={handleSearchChange}
      enableRoutineVisibilityFilter
      hasMoreIssues={hasMoreServerIssues}
      onLoadMoreIssues={loadMoreServerIssues}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      searchFilters={participantAgentId || workspaceIdFilter ? { participantAgentId, workspaceId: workspaceIdFilter } : undefined}
    />
  );
}
