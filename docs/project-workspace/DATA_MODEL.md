# Data model

Updated 2026-09-30. Existing relations are reused:

- issues.projectId: task ownership.
- routines.projectId: recurring work ownership.
- project_workspaces.projectId: native workspaces.
- project_goals(projectId, goalId, companyId): goal links; projects.goalId is legacy.
- cost_events.projectId: actual work costs, independent of membership.
- Artifacts: existing company projection joins originating issues to projects.

Implemented table: project_agent_memberships with id, company_id, project_id,
agent_id, nullable project_role, is_lead, nullable sort_order, created_at, updated_at.
Use repo foreign-key/deletion conventions, UNIQUE(project_id, agent_id), and indexes
for project and agent lookups. Generate a dedicated Drizzle migration via
`pnpm db:generate`; do not hand-edit generated snapshots.

Services validate project and agent belong to the same company on every write.
Routes enforce current company access and mutation authority, and log membership
changes. Deleting membership never deletes/pauses an agent or changes reportsTo.
No automatic legacy assignee migration occurs.

No new database table is needed for local scope preferences. Browser storage is
company-keyed, best-effort, and carries no authority. Validate saved IDs against
fetched company projects. URL scope likewise grants no authorization.

## Membership API — 2026-09-30

P2 data/contract implementation uses `project_agent_memberships` (integrated
checkout migration `0281_skinny_bushwacker.sql`; the source feature branch used 0291),
separate from user sidebar `project_memberships` and company `agents.reportsTo`.
Company/project and company/agent indexes support scoped lookup. The unique
(projectId, agentId) key supports membership in multiple projects.

- `GET /api/projects/:id/agent-memberships`: membership rows, guarded by company
  access and existing `project:read` authorization.
- `PUT /api/projects/:id/agent-memberships`: add/update one same-company agent,
  with optional projectRole, isLead, sortOrder. Duplicate writes reuse the link;
  omitted metadata fields retain their values. Metadata never changes company
  title, permissions, project.leadAgentId, or reportsTo.
- `DELETE /api/projects/:id/agent-memberships/:agentId`: delete only the link,
  returning `{ removed }`; repeat removal is safe.

Team mutations require a board actor with company write access. Company viewer
writes and agent-key writes are rejected. This initial authority matches board
team administration without introducing a new permission model. Cross-company
project IDs are hidden as 404; missing/foreign agents are rejected as 422.
Successful writes use project activity entries containing agentId and team
metadata. Removal only emits an audit event when a link existed.

These rows express participation, never a project authorization boundary.
Legacy external task/routine assignees remain valid company agents; UI must
explicitly offer Keep/Reassign/Add rather than silently change assignment.

## Scoped reads and goal creation — 2026-10-01

Work endpoints accept optional `projectId`; routes retain their existing company
and actor checks, validate the project belongs to that company, reject malformed
IDs as 400 and hide missing/foreign projects as 404. Omitting `projectId` preserves
company API behavior. No new accounting, authorization or work entity is added.

Dashboard member counts use `project_agent_memberships`; task counts use
`issues.projectId`. Run charts and live-run lists use explicit project snapshots
or project issues referenced by context/native issue/run activity. Membership alone
does not attribute a run. Project pending approvals use `issue_approvals`.

Project cost summary, agent/model/provider/biller/project breakdowns and rolling
windows filter `cost_events.projectId`. Unattributed historical costs stay out of
project totals. The existing company by-project historical fallback is preserved.
Company budget values and counters are zero in a project aggregate; UI suppresses
those fields and labels explicit organization budget/finance views separately.

Activity and audit pagination filter before their limits, using explicit project,
issue, comment, document, work product, workspace operation, approval, routine,
goal, workspace and run relations. Shared member-agent configuration activity does
not qualify by membership alone. JSON audit and CSV export use the same filter.

`POST /companies/:companyId/goals` accepts creation-only `projectId`. The goal and
`project_goals` link commit in one transaction after same-company project
validation; failure leaves neither partial goal nor relation. Generic goal updates
do not accept this field. Scoped goal reads include existing project links and the
legacy `projects.goalId` relation without overwriting other links.

Team lists sort by `sortOrder`, then creation time and ID; null orders follow
explicit values. `isLead` is participation metadata and can be set on multiple
members. It is independent of `projects.leadAgentId` and `agents.reportsTo`.


## Departments — 2026-10-01

Improvement-teams plugin migration 004 adds company-scoped departments (id,
company_id, name, nullable head_agent_id, timestamps) and a nullable department_id
on teams. A unique company/name prevents duplicate departments. The composite
team department/company foreign key prevents cross-company links and preserves
team project, member and cycle/history records.

`company-teams` returns departments and each team's departmentId. `save-department`
accepts the complete team-ID selection with an optional existing company agent
as head. The worker locks company teams in deterministic order, rejects teams
already assigned elsewhere, and atomically replaces the department's selection.
Empty departments are valid. Removal from one department permits reassignment.
This relationship does not rewrite native agent reportsTo. Minister-template
authority still uses the validated native direct reporting chain.

Both Departments and Groups use a company-keyed organization query cache.
Department save invalidates that shared key; a company switch resets unsaved
forms. Skills, connectors and audit are separate tools/records navigation.
