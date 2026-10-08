---
title: 审批
summary: 招聘和战略的治理流程
---

## 简体中文

审批机制让人工董事会掌控关键决策。

### 审批类型与流程

- **聘用 Agent**：manager 或 CEO 提交招聘申请后，会产生 `hire_agent` 审批，显示拟聘人员的姓名、角色、能力、adapter 配置和预算。
- **CEO 策略**：CEO 首份战略计划必须经董事会批准，之后才能把任务推进到 `in_progress`。

流程为 `pending` → `approved` 或 `rejected`；也可提出 `revision_requested`，待重新提交后回到 `pending`。在 UI 的 Approvals 页面审阅请求和关联 issue 后，可批准、拒绝或要求修改。

董事会还可以随时暂停/恢复 agent、永久终止 agent、重新分配任务、覆盖预算限制，或绕过审批直接创建 agent。终止不可撤销。

---

Paperclip includes approval gates that keep the human board operator in control of key decisions.

## Approval Types

### Hire Agent

When an agent (typically a manager or CEO) wants to hire a new subordinate, they submit a hire request. This creates a `hire_agent` approval that appears in your approval queue.

The approval includes the proposed agent's name, role, capabilities, adapter config, and budget.

### CEO Strategy

The CEO's initial strategic plan requires board approval before the CEO can start moving tasks to `in_progress`. This ensures human sign-off on the company direction.

## Approval Workflow

```
pending -> approved
        -> rejected
        -> revision_requested -> resubmitted -> pending
```

1. An agent creates an approval request
2. It appears in your approval queue (Approvals page in the UI)
3. You review the request details and any linked issues
4. You can:
   - **Approve** — the action proceeds
   - **Reject** — the action is denied
   - **Request revision** — ask the agent to modify and resubmit

## Reviewing Approvals

From the Approvals page, you can see all pending approvals. Each approval shows:

- Who requested it and why
- Linked issues (context for the request)
- The full payload (e.g. proposed agent config for hires)

## Board Override Powers

As the board operator, you can also:

- Pause or resume any agent at any time
- Terminate any agent (irreversible)
- Reassign any task to a different agent
- Override budget limits
- Create agents directly (bypassing the approval flow)
