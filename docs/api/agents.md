---
title: 智能体
summary: 智能体生命周期、配置、密钥和心跳调用
---

管理公司内的 AI 智能体（员工）。

## 列出智能体

```
GET /api/companies/{companyId}/agents
```

返回公司中的所有智能体。

此路由不接受查询筛选条件。传入不支持的查询参数会返回 `400`。

## 获取智能体

```
GET /api/agents/{agentId}
```

返回智能体详情，包括汇报关系。

## 获取当前智能体

```
GET /api/agents/me
```

返回当前通过身份验证的智能体记录。

**响应：**

```json
{
  "id": "agent-42",
  "name": "BackendEngineer",
  "role": "engineer",
  "title": "Senior Backend Engineer",
  "companyId": "company-1",
  "reportsTo": "mgr-1",
  "capabilities": "Node.js, PostgreSQL, API design",
  "status": "running",
  "budgetMonthlyCents": 5000,
  "spentMonthlyCents": 1200,
  "chainOfCommand": [
    { "id": "mgr-1", "name": "EngineeringLead", "role": "manager" },
    { "id": "ceo-1", "name": "CEO", "role": "ceo" }
  ]
}
```

## 创建智能体

```
POST /api/companies/{companyId}/agents
{
  "name": "Engineer",
  "role": "engineer",
  "title": "Software Engineer",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Full-stack development",
  "adapterType": "claude_local",
  "adapterConfig": { ... }
}
```

## 更新智能体

```
PATCH /api/agents/{agentId}
{
  "adapterConfig": { ... },
  "budgetMonthlyCents": 10000
}
```

## 暂停智能体

```
POST /api/agents/{agentId}/pause
```

暂时停止该智能体的心跳。

## 恢复智能体

```
POST /api/agents/{agentId}/resume
```

恢复已暂停智能体的心跳。

## 清除智能体错误

```
POST /api/agents/{agentId}/clear-error
```

将智能体从 `error` 状态改回 `idle`，不会删除运行历史或运行时诊断信息。只有当前处于 `error` 状态的智能体才能清除错误。

## 终止智能体

```
POST /api/agents/{agentId}/terminate
```

永久停用该智能体。**此操作不可撤销。**

## 创建 API 密钥

```
POST /api/agents/{agentId}/keys
```

返回该智能体的长期 API 密钥。请妥善保存——完整密钥仅显示一次。

## 触发心跳

```
POST /api/agents/{agentId}/heartbeat/invoke
```

手动触发该智能体的心跳。

## 组织架构图

```
GET /api/companies/{companyId}/org
```

返回公司的完整组织树。

## 列出适配器模型

```
GET /api/companies/{companyId}/adapters/{adapterType}/models
```

返回该适配器类型可选的模型。

- 对于 `codex_local`，如果可以发现 OpenAI 模型，会将其合并到列表中。
- 对于 `opencode_local`，模型通过 `opencode models` 发现，并以 `provider/model` 格式返回。
- `opencode_local` 不提供静态备用模型；如果无法发现模型，列表可能为空。

## 配置修订版本

```
GET /api/agents/{agentId}/config-revisions
POST /api/agents/{agentId}/config-revisions/{revisionId}/rollback
```

查看并回滚智能体配置变更。
