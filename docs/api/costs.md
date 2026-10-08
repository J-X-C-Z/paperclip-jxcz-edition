---
title: 费用
summary: 费用事件、摘要和预算管理
---

跟踪智能体、项目和公司的令牌用量与支出。

## 上报费用事件

```
POST /api/companies/{companyId}/cost-events
{
  "agentId": "{agentId}",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 15000,
  "outputTokens": 3000,
  "costCents": 12
}
```

通常由适配器在每次心跳后自动上报。

## 公司费用摘要

```
GET /api/companies/{companyId}/costs/summary
```

返回当月总支出、预算和使用率。

## 按智能体统计费用

```
GET /api/companies/{companyId}/costs/by-agent
```

返回当月每个智能体的费用明细。

## 按项目统计费用

```
GET /api/companies/{companyId}/costs/by-project
```

返回当月每个项目的费用明细。

## 按团队和部门统计费用

```
GET /api/companies/{companyId}/costs/by-team
GET /api/companies/{companyId}/costs/by-department
```

摘要和组织统计端点接受 `from`、`to` 和 `projectId` 筛选条件。组织统计会分别列出上报金额、估算金额、令牌用量和未定价事件数。团队归属依据当前成员版本和事件所属项目。归属不明确的成员会保持未分配，避免重复计算同一事件。部门归属使用匹配团队的部门；同一部门内即使匹配到多个团队，也只计入一次。无法明确归属的事件会列入“未分配”。

费用会自动记录。运行时未提供美元金额时，系统会根据令牌用量和带版本的官方价格表估算支持的模型费用。没有已知价格的模型会保持未定价。订阅所含用量可能显示 API 等效估值；该金额仅供参考，不会形成额外订阅费用，也不会占用支出预算。

## 显示币种和每日汇率

```
GET /api/companies/{companyId}/costs/exchange-rate
```

返回 `{ base: "USD", quote: "CNY", rate, updatedAt, source, stale }`。`updatedAt` 是汇率提供方的参考日期。服务器使用 Frankfurter 的公开 USD/CNY 端点，在运行期间每 24 小时刷新一次，并将汇率和上次尝试记录保存在实例的 `data/usd-cny-rate.json` 中，避免重启后重复请求。并发请求会共用一次刷新。刷新失败时保留上一汇率并设置 `stale: true`；如果没有已知汇率，`rate` 为 null。参考日期过旧时也会标记为过期。

费用审计页和预算页支持以 USD/CNY 显示，并在本地记住所选币种。存储的金额和预算策略输入仍以美分（USD cents）计。汇率获取失败时不会用虚构汇率替代；页面会显示无法换算的金额，或将最近一次已知汇率标记为过期。

## 预算管理

### 设置公司预算

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### 设置智能体预算

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

## 预算执行

| 阈值 | 效果 |
|-----------|--------|
| 80% | 软提醒 — 智能体应优先处理关键任务 |
| 100% | 强制停止 — 自动暂停智能体 |

预算周期在每月第一天（UTC）重置。

## 按团队和部门统计费用

```
GET /api/companies/{companyId}/costs/by-team
GET /api/companies/{companyId}/costs/by-department
```

项目、团队和部门费用端点接受 `from`、`to` 和 `projectId` 筛选条件。它们会分别返回上报金额、基于令牌用量的估算金额，以及尚未定价的事件数。这些明细中的 `costCents` 是参考总额（上报金额加估算金额）；公司摘要中的 `spendCents` 仍表示已记录的预算支出。订阅费用估算是 API 等效参考值，并非订阅账单。

团队归属依据费用所属项目中当前有效的成员关系。成员关系不明确或缺失时会显示在“未分配”行中；同一费用在每个维度下只计一次。共享同一部门的团队可以将无法明确归属的团队费用计入该共同部门。这些视图反映当前组织结构，并非历史成员快照。仅当某次运行明确关联一个项目时才会使用旧项目链接；关联不明确的记录仍保持未分配。
