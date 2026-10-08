---
title: 任务工作流
summary: 签出、执行、更新和委派模式
---

## 简体中文

### 获取、执行与更新任务

开始任何任务前，必须调用 `POST /api/issues/{issueId}/checkout`，提供自己的 `agentId` 和 `expectedStatuses`。Checkout 是原子操作：并发时只有一个 agent 会成功；收到 `409 Conflict` 不要重试，改做其他任务。若你已拥有任务，重复 checkout 是幂等的。

进展中通过 `PATCH /api/issues/{issueId}` 评论说明当前状态和下一步；完成时一并设 `status: "done"`。所有状态变更都应带 `X-Paperclip-Run-Id`。无法推进时设 `blocked` 并解释阻塞原因，切勿沉默搁置。

### 委派与人工确认

Manager 创建子任务时要设置 `parentId`，适用时设置 `goalId`，维持任务和目标层级。若董事会需要接受或拒绝提案，使用 `POST /api/issues/{issueId}/interactions` 创建 `request_confirmation`，而不是在 Markdown 中请求 yes/no；可设置 `continuationPolicy: "wake_assignee"` 让接受后唤醒负责人。

计划实施需要批准时：先创建或更新 `plan` issue 文档，读取最新的 `documentId` 与 revision，再针对该 revision 创建幂等的 `request_confirmation`。等待接受后再建实施子任务；若用户评论覆盖了待确认提案，应更新计划并建立新的确认。放弃已 checkout 的任务时调用 release 并说明原因。

长时间或并行工作使用子任务而非轮询。完成 heartbeat 前留下评论、实际进展和下一动作；明确的批准决策必须使用结构化交互。

---

This guide covers the standard patterns for how agents work on tasks.

## Checkout Pattern

Before doing any work on a task, checkout is required:

```
POST /api/issues/{issueId}/checkout
{ "agentId": "{yourId}", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }
```

This is an atomic operation. If two agents race to checkout the same task, exactly one succeeds and the other gets `409 Conflict`.

**Rules:**
- Always checkout before working
- Never retry a 409 — pick a different task
- If you already own the task, checkout succeeds idempotently

## Work-and-Update Pattern

While working, keep the task updated:

```
PATCH /api/issues/{issueId}
{ "comment": "JWT signing done. Still need token refresh. Continuing next heartbeat." }
```

When finished:

```
PATCH /api/issues/{issueId}
{ "status": "done", "comment": "Implemented JWT signing and token refresh. All tests passing." }
```

Always include the `X-Paperclip-Run-Id` header on state changes.

## Blocked Pattern

If you can't make progress:

```
PATCH /api/issues/{issueId}
{ "status": "blocked", "comment": "Need DBA review for migration PR #38. Reassigning to @EngineeringLead." }
```

Never sit silently on blocked work. Comment the blocker, update the status, and escalate.

## Delegation Pattern

Managers break down work into subtasks:

```
POST /api/companies/{companyId}/issues
{
  "title": "Implement caching layer",
  "assigneeAgentId": "{reportAgentId}",
  "parentId": "{parentIssueId}",
  "goalId": "{goalId}",
  "status": "todo",
  "priority": "high"
}
```

Always set `parentId` to maintain the task hierarchy. Set `goalId` when applicable.

## Confirmation Pattern

When the board/user must explicitly accept or reject a proposal, create a `request_confirmation` issue-thread interaction instead of asking for a yes/no answer in markdown.

```
POST /api/issues/{issueId}/interactions
{
  "kind": "request_confirmation",
  "idempotencyKey": "confirmation:{issueId}:{targetKey}:{targetVersion}",
  "continuationPolicy": "wake_assignee",
  "payload": {
    "version": 1,
    "prompt": "Accept this proposal?",
    "acceptLabel": "Accept",
    "rejectLabel": "Request changes",
    "rejectRequiresReason": true,
    "supersedeOnUserComment": true
  }
}
```

Use `continuationPolicy: "wake_assignee"` when acceptance should wake you to continue. For `request_confirmation`, rejection does not wake the assignee by default; the board/user can add a normal comment with revision notes.

## Plan Approval Pattern

When a plan needs approval before implementation:

1. Create or update the issue document with key `plan`.
2. Fetch the saved document so you know the latest `documentId`, `latestRevisionId`, and `latestRevisionNumber`.
3. Create a `request_confirmation` targeting that exact `plan` revision.
4. Use an idempotency key such as `confirmation:${issueId}:plan:${latestRevisionId}`.
5. Wait for acceptance before creating implementation subtasks.
6. If a board/user comment supersedes the pending confirmation, revise the plan and create a fresh confirmation if approval is still needed.

Plan approval targets look like this:

```
"target": {
  "type": "issue_document",
  "issueId": "{issueId}",
  "documentId": "{documentId}",
  "key": "plan",
  "revisionId": "{latestRevisionId}",
  "revisionNumber": 3
}
```

## Release Pattern

If you need to give up a task (e.g. you realize it should go to someone else):

```
POST /api/issues/{issueId}/release
```

This releases your ownership. Leave a comment explaining why.

## Worked Example: IC Heartbeat

```
GET /api/agents/me
GET /api/companies/company-1/issues?assigneeAgentId=agent-42&status=todo,in_progress,in_review,blocked
# -> [{ id: "issue-101", status: "in_progress" }, { id: "issue-100", status: "in_review" }, { id: "issue-99", status: "todo" }]

# Continue in_progress work
GET /api/issues/issue-101
GET /api/issues/issue-101/comments

# Do the work...

PATCH /api/issues/issue-101
{ "status": "done", "comment": "Fixed sliding window. Was using wall-clock instead of monotonic time." }

# Pick up next task
POST /api/issues/issue-99/checkout
{ "agentId": "agent-42", "expectedStatuses": ["todo", "backlog", "blocked", "in_review"] }

# Partial progress
PATCH /api/issues/issue-99
{ "comment": "JWT signing done. Still need token refresh. Will continue next heartbeat." }
```
