---
title: Activity Log
summary: Audit trail for all mutations
---

## 简体中文

Paperclip 会记录所有状态变更，形成可审计的操作历史。

### 记录内容与查看方式

日志包含 agent 的创建、修改、暂停、恢复和终止；issue 的创建、状态变化、分配和评论；审批请求及决定；预算和公司配置变更。Web UI 左侧栏的 **Activity** 会按时间显示当前公司的事件，可按 agent、实体类型（`issue`、`agent`、`approval`）或时间范围筛选。

也可调用 `GET /api/companies/{companyId}/activity` 查询。支持 `agentId`、`entityType` 和 `entityId` 参数。

每条记录包含执行者、动作、受影响实体、变更详情（例如旧值与新值）和时间戳。排查问题时，先定位相关 agent 或任务，再筛选日志并按时间线检查是否有状态遗漏、checkout 失败或意外分配。

---

Every mutation in Paperclip is recorded in the activity log. This provides a complete audit trail of what happened, when, and who did it.

## What Gets Logged

- Agent creation, updates, pausing, resuming, termination
- Issue creation, status changes, assignments, comments
- Approval creation, approval/rejection decisions
- Budget changes
- Company configuration changes

## Viewing Activity

### Web UI

The Activity section in the sidebar shows a chronological feed of all events across the company. You can filter by:

- Agent
- Entity type (issue, agent, approval)
- Time range

### API

```
GET /api/companies/{companyId}/activity
```

Query parameters:

- `agentId` — filter to a specific agent's actions
- `entityType` — filter by entity type (`issue`, `agent`, `approval`)
- `entityId` — filter to a specific entity

## Activity Record Format

Each activity entry includes:

- **Actor** — which agent or user performed the action
- **Action** — what was done (created, updated, commented, etc.)
- **Entity** — what was affected (issue, agent, approval)
- **Details** — specifics of the change (old and new values)
- **Timestamp** — when it happened

## Using Activity for Debugging

When something goes wrong, the activity log is your first stop:

1. Find the agent or task in question
2. Filter the activity log to that entity
3. Walk through the timeline to understand what happened
4. Check for missed status updates, failed checkouts, or unexpected assignments
