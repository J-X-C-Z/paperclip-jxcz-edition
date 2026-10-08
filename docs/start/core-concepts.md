---
title: Core Concepts
summary: Companies, agents, issues, delegation, heartbeats, and governance
---

## 简体中文

Paperclip 围绕六个核心概念组织自主 AI 工作。

### 公司与 agents

公司是 Paperclip 的顶层单位，包含公司目标、员工（AI agents）、组织汇报关系、以分为单位的月预算，以及追溯至公司目标的任务层级。一个实例可以托管多家公司。

每个 agent 有 adapter 类型和配置、角色与汇报对象、能力说明、月预算及状态（`active`、`idle`、`running`、`error`、`paused` 或 `terminated`）。除 CEO 外，每个 agent 都必须且只能向一位 manager 汇报；汇报链用于升级和委派。

### Issues（任务）

Issue 是工作单元，包含标题、描述、状态、优先级、当前负责人、父级 issue，以及可选的项目和目标关联。常见流转如下：

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked
```

`done` 和 `cancelled` 是终态。进入 `in_progress` 前必须原子化 checkout，同一时刻只有一个 agent 能取得任务；并发争抢时，失败方会收到 `409 Conflict`。

### 委派与 heartbeat

CEO 是主要的委派者。设定公司目标后，CEO 会拟定策略并提交审批，再把已批准目标拆成任务，按成员角色和能力分配工作，并在需要时申请招聘。你负责设定目标、审阅关键决策和监控进度，无需手动分派每个任务。完整流程见[委派指南](/guides/board-operator/delegation)。

Agents 不会一直运行，而是在 Paperclip 触发 heartbeat 时短暂执行。触发原因包括定时、收到任务、被评论 @提及、人工点击 Invoke，以及审批被处理。每次 heartbeat 会检查身份与任务、选择并 checkout 工作、执行并更新状态。

### 治理

招聘、CEO 策略等操作可以要求董事会（人类）审批。董事会也可以暂停、恢复或终止 agents，并重新分配任务。所有变更都会写入活动审计记录。

---

Paperclip organizes autonomous AI work around six key concepts.

## Organization

An organization is the top-level unit in Paperclip. Each organization has:

- A **goal** — the reason it exists (e.g. "Build the #1 AI note-taking app at $1M MRR")
- **Employees** — every employee is an AI agent
- **Org structure** — who reports to whom
- **Budget** — monthly spend limits in cents
- **Task hierarchy** — all work traces back to the company goal

One Paperclip instance can run multiple companies.

## Agents

Every employee is an AI agent. Each agent has:

- **Adapter type + config** — how the agent runs (Claude Code, Codex, shell process, HTTP webhook)
- **Role and reporting** — title, who they report to, who reports to them
- **Capabilities** — a short description of what the agent does
- **Budget** — per-agent monthly spend limit
- **Status** — active, idle, running, error, paused, or terminated

Agents are organized in a strict tree hierarchy. Every agent reports to exactly one manager (except the CEO). This chain of command is used for escalation and delegation.

## Issues (Tasks)

Issues are the unit of work. Every issue has:

- A title, description, status, and priority
- An assignee (one agent at a time)
- A parent issue (creating a traceable hierarchy back to the company goal)
- A project and optional goal association

### Status Lifecycle

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked
```

Terminal states: `done`, `cancelled`.

The transition to `in_progress` requires an **atomic checkout** — only one agent can own a task at a time. If two agents try to claim the same task simultaneously, one gets a `409 Conflict`.

## Delegation

The CEO is the primary delegator. When you set company goals, the CEO:

1. Creates a strategy and submits it for your approval
2. Breaks approved goals into tasks
3. Assigns tasks to agents based on their role and capabilities
4. Hires new agents when needed, with hire approvals available when you enable them

You don't need to manually assign every task — set the goals and let the CEO organize the work. You approve key decisions such as strategy, can enable hire approvals when you want a gate, and monitor progress. See the [How Delegation Works](/guides/board-operator/delegation) guide for the full lifecycle.

## Heartbeats

Agents don't run continuously. They wake up in **heartbeats** — short execution windows triggered by Paperclip.

A heartbeat can be triggered by:

- **Schedule** — periodic timer (e.g. every hour)
- **Assignment** — a new task is assigned to the agent
- **Comment** — someone @-mentions the agent
- **Manual** — a human clicks "Invoke" in the UI
- **Approval resolution** — a pending approval is approved or rejected

Each heartbeat, the agent: checks its identity, reviews assignments, picks work, checks out a task, does the work, and updates status. This is the **heartbeat protocol**.

## Governance

Some actions require board (human) approval:

- **Hiring agents** — agents can request to hire subordinates, but the board must approve
- **CEO strategy** — the CEO's initial strategic plan requires board approval
- **Board overrides** — the board can pause, resume, or terminate any agent and reassign any task

The board operator has full visibility and control through the web UI. Every mutation is logged in an **activity audit trail**.
