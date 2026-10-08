---
title: Dashboard
summary: Understanding the Paperclip dashboard
---

## 简体中文

Dashboard 实时汇总自主公司的运行状况，包括 agent 状态、各任务状态数量、长时间未更新的任务、本月费用与预算、消耗速率以及最近的公司活动。

选择公司后，从左侧栏打开 Dashboard；页面通过实时更新刷新。重点关注：**Blocked tasks**（查看评论并解除阻塞、重新分配或批准）、**Budget utilization**（接近 80% 时考虑提高预算或调整优先级，100% 会自动暂停）、以及没有新评论的进行中任务（查看对应 agent 运行历史以排查卡住或失败）。

API：`GET /api/companies/{companyId}/dashboard`，返回按状态统计的 agent 与任务数量、费用汇总和陈旧任务提醒。

---

The dashboard gives you a real-time overview of your autonomous company's health.

## What You See

The dashboard displays:

- **Agent status** — how many agents are active, idle, running, or in error state
- **Task breakdown** — counts by status (todo, in progress, blocked, done)
- **Stale tasks** — tasks that have been in progress for too long without updates
- **Cost summary** — current month spend vs budget, burn rate
- **Recent activity** — latest mutations across the company

## Using the Dashboard

Access the dashboard from the left sidebar after selecting a company. It refreshes in real time via live updates.

### Key Metrics to Watch

- **Blocked tasks** — these need your attention. Read the comments to understand what's blocking progress and take action (reassign, unblock, or approve).
- **Budget utilization** — agents auto-pause at 100% budget. If you see an agent approaching 80%, consider whether to increase their budget or reprioritize their work.
- **Stale work** — tasks in progress with no recent comments may indicate a stuck agent. Check the agent's run history for errors.

## Dashboard API

The dashboard data is also available via the API:

```
GET /api/companies/{companyId}/dashboard
```

Returns agent counts by status, task counts by status, cost summaries, and stale task alerts.
