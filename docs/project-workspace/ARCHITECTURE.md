# Project Workspace architecture

Company = governance context. Project = work context.
Project membership ≠ Company reportsTo.

This is an experimental native extension of existing pages. No plugin page,
parallel task system, authorization boundary, or company duplication is introduced.
The feature uses the existing instance experimental setting pipeline; it is off
by default until the integrated behavior is verified.

The intended single source of truth is ProjectScopeProvider inside the router and
CompanyProvider, above pages, sidebar, dialogs, search and create flows. It exposes
mode, activeProjectId, activeProject, setActiveProject, clearProject and
isProjectScoped, as well as loading/error state for unresolved selection.

Selection order is explicit URL `project`, then a per-company saved preference,
then All Company. `?project=` explicitly selects All Company. Invalid or foreign
projects resolve to All Company. Loading or failed project validation must never
expose an unvalidated project ID, nor overwrite a valid saved preference on failure.
Company switching restores the destination preference without retaining the old
company's project. Project switching keeps pathname, unrelated query parameters
and hash. Direct task/agent navigation never silently switches context.

Queries include company and project. During a scope switch, old data must not be
rendered as the new scope; previous placeholder data cannot cross scope boundaries.
Feature off skips scope-only project fetches and uses original API behavior.

Creation uses one helper to default/guard project ownership. Scoped agents come
from membership, with an explicit escape for legacy non-member assignees.
Membership removal changes only the link. Org roots arise when a member's company
parent is absent; there is no new chain of command.

Costs use actual project attribution. Activity and artifacts include only events
with a provable relation. Projects, budgets where global, quotas, access, settings,
plugins, and global reporting authority remain company/instance governance.

Implementation and verification are tracked in SCOPE_MATRIX. On 2026-10-01 the
feature implementation was integrated into the original Downloads/Paperclip
checkout while preserving its existing changes. Code completion is separate from
browser and full-suite acceptance; the integration owner records those results.

After the checkout moved to AW, the 2026-10-01 continuation validated the original
database and local browser behavior; see ACCEPTANCE_2026-10-01.md. Settings
availability is part of scope validation: an initial or background settings
failure blocks work reads, agent caches and creation, exposes a retryable error,
and returns no effective project ID. Only a successful settings response with
the experiment disabled restores company-only behavior. Retry reloads both
settings and project validation.
