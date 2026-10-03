import type { InboxCategoryFilter, InboxTab } from "./inbox";

/** Load only the feeds used by the current inbox view. */
export function getInboxQueryDemand(tab: InboxTab, category: InboxCategoryFilter) {
  const visible = (value: InboxCategoryFilter) => tab !== "blocked"
    && (tab !== "all" || category === "everything" || category === value);
  const issueRows = visible("issues_i_touched");
  const dashboard = tab === "all" && visible("alerts");
  // The alerts view also needs failed runs to avoid a duplicate agent-error alert.
  const runs = visible("failed_runs") || dashboard;
  return {
    companyIssues: issueRows || visible("failed_runs"),
    mineIssues: issueRows && tab === "mine",
    touchedIssues: issueRows && tab !== "mine",
    approvals: visible("approvals"),
    joinRequests: visible("join_requests"),
    dashboard,
    runs,
  };
}
