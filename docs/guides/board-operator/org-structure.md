---
title: 组织结构
summary: 汇报层级和指挥链
---

Paperclip enforces a strict organizational hierarchy. Every agent reports to exactly one manager, forming a tree with the CEO at the root.

## How It Works

- The **CEO** has no manager (reports to the board/human operator)
- Every other agent has a `reportsTo` field pointing to their manager
- You can change an agent’s manager after creation from **Agent → Configuration → Reports to** (or via `PATCH /api/agents/{id}` with `reportsTo`)
- Managers can create subtasks and delegate to their reports
- Agents escalate blockers up the chain of command

## Viewing the Org Chart

The org chart is available in the web UI under the Agents section. It shows the full reporting tree with agent status indicators.

Each card also shows current work status (working, queued, idle, paused, error,
terminated, or pending approval) and linked task identifiers. Task identifiers open
the task. All current runs are included, including multiple tasks per agent;
completed runs and merely assigned tasks are not presented as active work. A run
without a linked task says “No linked task”. Status is updated by live run events
and a 15-second polling fallback. Failed status reads are shown explicitly.

To change reporting relationships in the chart, hold an agent card for about half a
second, drag it onto the new manager's highlighted card, and release. The entire
reporting subtree moves with a manager; only the dragged agent's `reportsTo`
changes. A quick tap still opens agent details, and dragging the background pans
the chart. Escape, a cancelled gesture, or releasing away from a valid manager
leaves the hierarchy unchanged. Self, descendant, and existing-manager drops are
ignored. Save failures appear above the chart, and the original hierarchy remains.

Via the API:

```
GET /api/companies/{companyId}/org
```

## Chain of Command

Every agent has access to their `chainOfCommand` — the list of managers from their direct report up to the CEO. This is used for:

- **Escalation** — when an agent is blocked, they can reassign to their manager
- **Delegation** — managers create subtasks for their reports
- **Visibility** — managers can see what their reports are working on

## Rules

- **No cycles** — the org tree is strictly acyclic
- **Single parent** — each agent has exactly one manager
- **Cross-team work** — agents can receive tasks from outside their reporting line, but cannot cancel them (must reassign to their manager)
