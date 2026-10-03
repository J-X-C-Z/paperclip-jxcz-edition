import { describe, expect, it, vi } from "vitest";
import { issuesApi } from "../api/issues";
import { mergeMyIssuePages, myIssuesQueryOptions, nextMyIssuesOffset } from "./my-issues-query";

vi.mock("../api/issues", () => ({ issuesApi: { listCompact: vi.fn().mockResolvedValue([]) } }));

const input = {
  companyId: "company-a", userId: "user-a", identitySettled: true,
  scopeEnabled: true, projectId: "project-a", scopeLoading: false, scopeError: null,
};

describe("My Tasks demand pagination", () => {
  it("fetches compact 30-row pages with server scope and original human/unassigned semantics", async () => {
    const options = myIssuesQueryOptions(input);
    const signal = new AbortController().signal;
    await options.queryFn({ pageParam: 0, signal });
    expect(issuesApi.listCompact).toHaveBeenLastCalledWith("company-a", {
      assigneeAgentId: "null", status: "backlog,todo,in_progress,in_review,blocked",
      projectId: "project-a", limit: 30, offset: 0, sortField: "updated", sortDir: "desc",
    }, { signal });
    await options.queryFn({ pageParam: 30, signal });
    expect(issuesApi.listCompact).toHaveBeenLastCalledWith("company-a",
      expect.objectContaining({ limit: 30, offset: 30 }), { signal });
  });

  it("advances full pages and stops short or empty pages", () => {
    expect(nextMyIssuesOffset(30, 0)).toBe(30);
    expect(nextMyIssuesOffset(30, 30)).toBe(60);
    expect(nextMyIssuesOffset(29, 30)).toBeUndefined();
    expect(nextMyIssuesOffset(0, 60)).toBeUndefined();
  });

  it("deduplicates overlapping pages while preserving first row order", () => {
    const first = { id: "a", title: "original" };
    expect(mergeMyIssuePages([[first, { id: "b" }], [{ id: "a" }, { id: "c" }]]))
      .toEqual([first, { id: "b" }, { id: "c" }]);
  });

  it("separates company, account and project cache entries", () => {
    const key = myIssuesQueryOptions(input).queryKey;
    expect(myIssuesQueryOptions({ ...input, companyId: "company-b" }).queryKey).not.toEqual(key);
    expect(myIssuesQueryOptions({ ...input, userId: "user-b" }).queryKey).not.toEqual(key);
    expect(myIssuesQueryOptions({ ...input, projectId: "project-b" }).queryKey).not.toEqual(key);
  });

  it("does not fetch until identity and project scope have settled successfully", () => {
    expect(myIssuesQueryOptions(input).enabled).toBe(true);
    expect(myIssuesQueryOptions({ ...input, companyId: null }).enabled).toBe(false);
    expect(myIssuesQueryOptions({ ...input, identitySettled: false }).enabled).toBe(false);
    expect(myIssuesQueryOptions({ ...input, scopeLoading: true }).enabled).toBe(false);
    expect(myIssuesQueryOptions({ ...input, scopeError: new Error("scope unavailable") }).enabled).toBe(false);
    // Local board mode may return a settled anonymous session; the server
    // retains authority over access, as it did before this performance change.
    expect(myIssuesQueryOptions({ ...input, userId: null }).enabled).toBe(true);
  });

  it("omits project filtering when project scope is disabled", async () => {
    const options = myIssuesQueryOptions({ ...input, scopeEnabled: false });
    await options.queryFn({ pageParam: 0, signal: new AbortController().signal });
    expect(issuesApi.listCompact).toHaveBeenLastCalledWith("company-a",
      expect.objectContaining({ projectId: undefined }), expect.anything());
  });
});
