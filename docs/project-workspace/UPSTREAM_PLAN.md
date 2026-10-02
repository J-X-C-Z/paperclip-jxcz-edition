# Upstream split

Updated 2026-10-01.

## A — Likely upstream candidate

Unified ProjectScopeContext, native switcher, company-keyed preference/URL
resolution, existing Tasks project filtering and creation defaults, scope-aware
query keys, isolation and feature-off tests. Existing instance flag infrastructure
hosts enableProjectWorkspace with false defaults.

## B — Needs maintainer discussion

Agent/project membership, filtered Org semantics, project Dashboard aggregate,
Activity attribution semantics, and any extension of native costs/goals endpoints.
These are implemented without changing company governance or reportsTo.

## C — Personal extensions

Empty. Hindsight, model routing, sessions, AW integration, project memory/prompts,
new delegation engines and RBAC redesign are excluded from this implementation.

The 2026-10-01 integration applies only feature deltas to the original
Downloads/Paperclip checkout; it does not replace that checkout with the newer
feature branch's upstream tree. Preserve unrelated translations and operator
changes. No commits or upstream submission are part of this integration.
