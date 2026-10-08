import { issuesApi } from "../api/issues";
import { queryKeys } from "./queryKeys";

export const MY_ISSUES_PAGE_SIZE = 30;
const ACTIVE_STATUSES = "backlog,todo,in_progress,in_review,blocked";

export function nextMyIssuesOffset(pageLength: number, offset: number) {
  return pageLength >= MY_ISSUES_PAGE_SIZE ? offset + MY_ISSUES_PAGE_SIZE : undefined;
}

export function mergeMyIssuePages<T extends { id: string }>(pages: T[][]): T[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  }));
}

export function myIssuesQueryOptions(input: {
  companyId: string | null;
  userId: string | null;
  identitySettled: boolean;
  scopeEnabled: boolean;
  projectId: string | null;
  scopeLoading: boolean;
  scopeError: Error | null;
}) {
  const projectId = input.scopeEnabled ? input.projectId ?? undefined : undefined;
  return {
    queryKey: [
      ...queryKeys.issues.list(input.companyId ?? "__none__"),
      "my-tasks", input.userId, projectId ?? "__company__",
      "compact", "infinite", MY_ISSUES_PAGE_SIZE,
    ],
    queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) =>
      issuesApi.listCompact(input.companyId!, {
        // Preserve the original human/unassigned collection, including tasks
        // assigned to a user, by only excluding agent assignments.
        assigneeAgentId: "null",
        status: ACTIVE_STATUSES,
        projectId,
        limit: MY_ISSUES_PAGE_SIZE,
        offset: pageParam,
        sortField: "updated",
        sortDir: "desc",
      }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: { id: string }[], _pages: { id: string }[][], offset: number) =>
      nextMyIssuesOffset(lastPage.length, offset),
    enabled: !!input.companyId && input.identitySettled
      && !input.scopeLoading && !input.scopeError,
  };
}
