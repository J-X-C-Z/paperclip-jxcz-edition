# Agent Template V1

Implemented natively in existing Paperclip agent creation. Shared templates are
versioned data validated by Zod. Company-scoped GET
`/api/companies/:companyId/agent-templates` returns four system presets: department head, team leader, team member, and custom.
Create and hire accept optional `templateId`; omitted values preserve existing
clients. Defaults are applied before validation, then explicit authorized
configuration wins. Instances persist provenance under `metadata.agentTemplate`
and their own editable configuration. Changing model, instructions or skills
does not alter provenance or other agents.

The UI selects a template before the existing name/adapter/model connection and
environment flow. Switching templates confirms a reset of template fields;
ordinary renders and returning to connection preserve edits. Member creation
requires an active same-company template leader. Existing hire approvals remain
required. Template roles do not confer CEO status.

Instructions are materialized as managed `instructionsBundle/AGENTS.md`.
Leader skills are the actual catalog entries task-planning, summarize-status,
reflection-coach and task-review; members receive task-execution. Creation
installs selected catalog content through the existing company skill service;
normal adapter synchronization handles runtime linkage. The UI labels selected
skills as configuration, not as installed runtime links.

Authority flags map to server task/agent authorization. Explicit template
restrictions run before legacy grants. Leaders can schedule direct members,
but cannot broaden their own permissions or change governance/reporting lines.
HTTP routes and issue services both protect member submission and execution
policy; native status arbitration changes member completion into review and
records the true actor. CLI and MCP writes use these same underlying checks.

A mandatory execution-policy stage reviews the member's submission. The current
leader may accept or return it, and changes requested go back to the original
member. Raw member reassignment, review-policy edits, cross-task writes and
self-completion are rejected. Unavailable leaders leave durable in_review state
and one pending human recovery interaction. After a board-authorized repair,
resubmission rebuilds the current leader stage. Recovery confirmation alone
cannot finish work. Agent deletion clears creator and assignee references with
separate predicates so deleting a task's creator preserves its member owner.

Validation includes rendered UI defaults/overrides, compatible creation and
hire routes, authorization checks backed by isolated databases, direct service
review/return/accept, and real native commits with active, paused, terminated and
deleted leaders. Live creation and review are checked inside the existing
Paperclip开发 organization, without enabling model execution. Legacy agents and
Orialis organization data are preserved.

Company-specific default Skills persist in `company_agent_template_defaults`,
added by migration `0280_company_agent_template_defaults.sql`. The template
settings page edits these defaults; newly created agents inherit them while
existing agents keep their selections. Per-agent catalog selections are
installed before skill assignment validation. Template application is a
shared entry point for future batch teams and plugin-supplied catalog data;
plugin registration and persisted user-authored template catalogs are outside this version.


## Department and custom positions (2026-10-01)

The organization templates page exposes a creation entry for each preset. A
`department-head` instance retains `department_head` provenance, uses the leader
planning/review Skills, and may schedule, configure or hire only its direct
same-company template leaders or legacy AW leaders (metadata.awRoleId ending
in -lead, or an explicit group-leader title/name). Department heads hire only
template leaders. The board configures department membership and
reporting separately; a template never grants authority over another department.
An optional head manager must be an active same-company executive or root
manager. Team members still require active template leaders and the existing
mandatory review lifecycle.

The `custom` preset uses neutral instructions, no Skills, and false task/agent
management permission defaults. The creation flow accepts an editable position
title, capability description, model, instructions, Skills and permissions.
Custom agents may have any active same-company manager or no manager, without
being forced into the team member role. Authorized explicit permission overrides
use the existing authorization path; selecting custom does not grant authority.


## Saved template Instructions (2026-10-01)

The template settings page edits Skills and Markdown Instructions together. PUT
`/api/companies/:companyId/agent-templates/:templateId` saves both as company-scoped
defaults. The nullable `system_prompt` column preserves built-in instructions for
older Skills-only rows. The existing Skills endpoint remains compatible and
retains any saved Instructions. Empty or whitespace-only Instructions are rejected.

Subsequent create/hire requests inherit the saved Markdown as the managed
`instructionsBundle/AGENTS.md`; explicit creation-time instruction bundles still
win. The creation UI reads the same company template list. Catalog objects and
existing agents never change when a company saves or restores its defaults.
Template mutations retain board/admin checks and activity logging.
