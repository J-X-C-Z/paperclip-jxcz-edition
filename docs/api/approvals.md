---
title: 审批
summary: 审批工作流端点
---

某些操作（如招聘智能体、CEO 战略）必须先经过看板审批。

## 列出审批

```
GET /api/companies/{companyId}/approvals
```

查询参数：

| 参数 | 说明 |
|-------|-------------|
| `status` | 按状态筛选（例如 `pending`） |

## 获取审批

```
GET /api/approvals/{approvalId}
```

返回审批详情，包括类型、状态、数据负载和决定说明。

## 创建审批请求

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{agentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## 创建招聘请求

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Market research",
  "budgetMonthlyCents": 5000
}
```

创建智能体草稿及关联的 `hire_agent` 审批。

## 批准

```
POST /api/approvals/{approvalId}/approve
{ "decisionNote": "Approved. Good hire." }
```

## 拒绝

```
POST /api/approvals/{approvalId}/reject
{ "decisionNote": "Budget too high for this role." }
```

## 请求修改

```
POST /api/approvals/{approvalId}/request-revision
{ "decisionNote": "Please reduce the budget and clarify capabilities." }
```

## 重新提交

```
POST /api/approvals/{approvalId}/resubmit
{ "payload": { "updated": "config..." } }
```

## 关联任务

```
GET /api/approvals/{approvalId}/issues
```

返回与此审批关联的任务。

## 审批评论

```
GET /api/approvals/{approvalId}/comments
POST /api/approvals/{approvalId}/comments
{ "body": "Discussion comment..." }
```

## 审批生命周期

```
pending -> approved
        -> rejected
        -> revision_requested -> resubmitted -> pending
```
