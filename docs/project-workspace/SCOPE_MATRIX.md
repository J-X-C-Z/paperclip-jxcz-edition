# Scope matrix

Updated 2026-10-01. The integrated original checkout now lives in
`/Users/jxcz/Agent Workspace/Paperclip`. Company remains governance; Project
selects work. Current local acceptance is recorded in
[ACCEPTANCE_2026-10-01.md](ACCEPTANCE_2026-10-01.md).

| Module | Project scope | Integrated behavior | Code state |
| --- | --- | --- | --- |
| Sidebar | Yes | Native project switcher, All Company, URL and company preference, validation/loading/error/retry | Implemented |
| Dashboard | Yes | Server aggregate for members/tasks/stored project spend/attributable run chart; related activity and live runs | Implemented |
| Tasks | Yes | Existing server project filter, isolated cache identity, creation project defaults and direct-detail notice | Implemented |
| Team | Yes | Project Team membership add/remove, role/lead edit, stored order in GET; same-company board writes | Implemented |
| Agents | Yes | Membership-filtered roster/sidebar/pickers; explicit handling of legacy non-member assignees | Implemented |
| Org | Yes | Members only, preserves reportsTo and promotes members with absent parents to roots | Implemented |
| Goals | Yes | Existing project_goals plus legacy relation reads; goal and project link created atomically | Implemented |
| Routines | Yes | Existing project filter, creation default, scoped task queries and cache identity | Implemented |
| Artifacts | Attributable only | Existing company artifact projection with server project filter | Implemented |
| Workspaces | Yes | Native project/execution workspace filters and isolated cache identity | Implemented |
| Costs | Yes | Stored cost-event project attribution across all inference aggregates and windows | Implemented |
| Activity | Attributable only | SQL project/entity/issue/run attribution before limits; audit JSON and CSV use same filter | Implemented |
| Search | Yes | Scoped company search/issue queries and cache identity, explicit All Company escape | Implemented |
| Projects | No | Company project management, including per-project Team detail | Preserved |
| Budgets/finance/quotas | Governance | Organization budget/finance tabs labeled; provider quotas remain organization-wide | Preserved |
| Settings/plugins/users/access | No | Existing company/instance governance and authorization | Preserved |

Team lead flags do not create command authority. Multiple participation leads are
allowed. Removing membership changes only its link. Ordering metadata is accepted
by the API; the current Team UI displays server order and provides up/down controls.

Project validation loading or failure blocks work queries and stale content.
Feature off exposes no effective project ID, skips scope-only project fetches,
and uses original company API filters/cache identity. Direct cross-project task
or agent access remains available through existing authorization.

## Recorded checks

Backend feature verification on 2026-10-01: five focused dashboard/cost/activity/
audit/scope suites passed 47 tests against fresh disposable PostgreSQL databases.
A follow-up scope HTTP and existing search regression run passed 36 tests in
three suites. Shared and server TypeScript checks passed. The integration owner
also verified the main checkout scope/membership tests (12 passed) and UI/server
TypeScript checks.

The PostgreSQL test helper supports an explicit
`PAPERCLIP_TEST_POSTGRES_ADMIN_URL` opt-in for hosts that cannot bootstrap a second
native cluster. It creates and drops uniquely named temporary databases; the
application database is never migrated or cleared by this path.

The earlier integration-root record above predates directory migration. The
2026-10-01 continuation verified the original database, 57 focused backend tests,
54 UI/formatting tests, UI typecheck/build, token gates, and actual group saving,
native membership, project/company switching. Eight-connection PostgreSQL group
concurrency also passed. See the acceptance report for evidence and limits.
This does not replace the historical full-suite or isolated managed-runtime
requirements on JXC-29/JXC-27; those tickets are not marked complete by this slice.
