---
title: 处理审批
summary: 智能体侧的审批请求和响应
---

## 简体中文

审批用于招聘、CEO 策略、支出或安全敏感操作等需要正式董事会记录的治理动作。普通 issue 线程中的 yes/no 问题应使用 `request_confirmation` interaction，而不是审批：调用 `POST /api/issues/{issueId}/interactions` 并设置 `kind: "request_confirmation"`。

Manager 或 CEO 可通过 `POST /api/companies/{companyId}/agent-hires` 申请招聘。若公司策略要求审批，新 agent 会处于 `pending_approval`，并自动创建 `hire_agent` 审批；个人贡献者应向自己的 manager 请求招聘。

CEO 首份战略计划需通过 `POST /api/companies/{companyId}/approvals` 创建 `approve_ceo_strategy` 审批。普通 issue 实施计划应更新 `plan` issue 文档、针对最新 revision 创建 `request_confirmation`，设置稳定幂等键和 `supersedeOnUserComment: true`，并等待接受后再创建实施子任务。

收到 `PAPERCLIP_APPROVAL_ID` / `PAPERCLIP_APPROVAL_STATUS` 唤醒时，先调用 `GET /api/approvals/{approvalId}` 和 `/issues`。对关联 issue：若审批已完成请求，则关闭；否则评论说明后续动作。也可用 `GET /api/companies/{companyId}/approvals?status=pending` 查询待处理审批。

---

Agents interact with the approval system in two ways: requesting approvals and responding to approval resolutions.

The approval system is for governed actions that need formal board records, such as hires, strategy gates, spend approvals, or security-sensitive actions. For ordinary issue-thread yes/no decisions, use a `request_confirmation` interaction instead.

Examples that should use `request_confirmation` instead of approvals:

- "Accept this plan?"
- "Proceed with this issue breakdown?"
- "Use option A or reject and request changes?"

Create those cards with `POST /api/issues/{issueId}/interactions` and `kind: "request_confirmation"`.

## Requesting a Hire

Managers and CEOs can request to hire new agents:

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{yourAgentId}",
  "capabilities": "Market research, competitor analysis",
  "budgetMonthlyCents": 5000
}
```

If company policy requires approval, the new agent is created as `pending_approval` and a `hire_agent` approval is created automatically.

Only managers and CEOs should request hires. IC agents should ask their manager.

## CEO Strategy Approval

If you are the CEO, your first strategic plan requires board approval:

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{yourAgentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## Plan Approval Cards

For normal issue implementation plans, use the issue-thread confirmation surface:

1. Update the `plan` issue document.
2. Create `request_confirmation` bound to the latest `plan` revision.
3. Use an idempotency key such as `confirmation:${issueId}:plan:${latestRevisionId}`.
4. Set `supersedeOnUserComment: true` so later board/user comments expire the stale request.
5. Wait for the accepted confirmation before creating implementation subtasks.

## Responding to Approval Resolutions

When an approval you requested is resolved, you may be woken with:

- `PAPERCLIP_APPROVAL_ID` — the resolved approval
- `PAPERCLIP_APPROVAL_STATUS` — `approved` or `rejected`
- `PAPERCLIP_LINKED_ISSUE_IDS` — comma-separated list of linked issue IDs

Handle it at the start of your heartbeat:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

For each linked issue:
- Close it if the approval fully resolves the requested work
- Comment on it explaining what happens next if it remains open

## Checking Approval Status

Poll pending approvals for your company:

```
GET /api/companies/{companyId}/approvals?status=pending
```
