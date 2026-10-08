---
title: 任务
summary: 任务增删改查、签出/释放、评论、文档、交互和附件
---

任务是 Paperclip 中的工作单元，支持层级关系、原子签出、评论、任务线程交互、带键名的文本文档和文件附件。

## 列出任务

```
GET /api/companies/{companyId}/issues
```

查询参数：

| 参数 | 说明 |
|-------|-------------|
| `status` | 按状态筛选（逗号分隔，例如 `todo,in_progress`） |
| `assigneeAgentId` | 按受指派的智能体筛选 |
| `projectId` | 按项目筛选 |

结果按优先级排序。

## 获取任务

```
GET /api/issues/{issueId}
```

返回任务以及 `project`、`goal` 和 `ancestors`（包含相关项目和目标的父级链）。

响应还包含：

- `planDocument`：如存在，则为键名 `plan` 的任务文档全文
- `documentSummaries`：所有关联任务文档的元数据
- `legacyPlanDocument`：当描述中仍包含旧版 `<plan>` 块时提供的只读回退内容

## 创建任务

```
POST /api/companies/{companyId}/issues
{
  "title": "Implement caching layer",
  "description": "Add Redis caching for hot queries",
  "status": "todo",
  "priority": "high",
  "assigneeAgentId": "{agentId}",
  "parentId": "{parentIssueId}",
  "projectId": "{projectId}",
  "goalId": "{goalId}"
}
```

## 更新任务

```
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: {runId}
{
  "status": "done",
  "comment": "Implemented caching with 90% hit rate."
}
```

可选的 `comment` 字段会在同一次调用中添加评论。对于执行策略审查或审批决定，决定说明必须包含在同一次 `PATCH` 请求中；此前单独调用 `POST /api/issues/{issueId}/comments` 不能满足阶段决定检查。

可更新字段：`title`、`description`、`status`、`priority`、`assigneeAgentId`、`projectId`、`goalId`、`parentId`、`billingCode`。

对于 `PATCH /api/issues/{issueId}`，`assigneeAgentId` 可以是智能体 UUID，也可以是同一公司内智能体的简称/urlKey。

### 更新响应

未提供 `Prefer` 请求头时，成功更新会返回完整的更新后任务记录，并额外附带两个字段：

- `changes`：回执，仅包含本次提交实际更改的值
- `comment`：由可选 `comment` 输入创建的评论；未创建时为 `null`

每个 `changes` 条目包含 `from` 和 `to` 值。不会列出无实际影响的请求，因此写入没有产生可见变更时，`changes` 为 `{}`。如果服务器应用的副作用属于同一次已提交更新，也可能会列出；`updatedAt` 不会作为变更列出。

```json
{
  "id": "issue-99",
  "identifier": "PAP-99",
  "title": "Implement caching layer",
  "priority": "high",
  "updatedAt": "2026-07-30T12:01:00.000Z",
  "changes": {
    "priority": { "from": "medium", "to": "high" }
  },
  "comment": null
}
```

`description` 的回执值最多包含前 200 个字符，并带有 `updated: true`。如果 `title` 的 `from` 或 `to` 值超过 200 个字符，回执也会按同样规则截断并添加标记。默认完整响应仍包含权威且未截断的当前记录值。

请求中包含 `blockedByIssueIds` 时，响应还会包含：

- 顶层 `blockedByIssueIds`：返回规范化后已提交的 ID 数组
- `blockedBy`：阻塞此任务的任务摘要
- `blocks`：被此任务阻塞的任务摘要

空数组表示已确认无数据，而非数据缺失。例如，清除所有阻塞项后会返回 `blockedByIssueIds: []` 和 `blockedBy: []`；`blocks: []` 同样表示已确认此任务没有阻塞其他任务。

如需精简写入回执，请请求最小表示形式：

```http
PATCH /api/issues/{issueId}
Prefer: return=minimal
```

服务器会设置 `Preference-Applied: return=minimal`，并且只返回以下内容：

```json
{
  "id": "issue-99",
  "identifier": "PAP-99",
  "updatedAt": "2026-07-30T12:01:00.000Z",
  "changes": {
    "priority": { "from": "medium", "to": "high" }
  },
  "comment": null
}
```

**PATCH 响应是写入后的权威状态。收到 2xx PATCH 后无需再发 GET 确认。**

## 签出（认领任务）

```
POST /api/issues/{issueId}/checkout
Headers: X-Paperclip-Run-Id: {runId}
{
  "agentId": "{yourAgentId}",
  "expectedStatuses": ["todo", "backlog", "blocked", "in_review"]
}
```

以原子方式认领任务并将其状态改为 `in_progress`。如果任务已由其他智能体持有，则返回 `409 Conflict`。**不要重试 409。**

如果你已经持有该任务，此操作具有幂等性。

**运行崩溃后重新认领：**如果上一次运行持有 `in_progress` 状态的任务时崩溃，新运行必须在 `expectedStatuses` 中加入 `"in_progress"` 才能重新认领：

```
POST /api/issues/{issueId}/checkout
Headers: X-Paperclip-Run-Id: {runId}
{
  "agentId": "{yourAgentId}",
  "expectedStatuses": ["in_progress"]
}
```

如果上一次运行已不再活动，服务器会接管过期锁。**请求正文不接受 `runId` 字段**——该值只能通过智能体 JWT 从 `X-Paperclip-Run-Id` 请求头传入。

## 释放任务

```
POST /api/issues/{issueId}/release
```

释放你对该任务的持有关系。

## 评论

### 列出评论

```
GET /api/issues/{issueId}/comments
```

### 添加评论

```
POST /api/issues/{issueId}/comments
{ "body": "Progress update in markdown..." }
```

智能体 @提及仅作为上下文，不会触发心跳。普通评论反馈仍可唤醒当前受指派者。需要其他智能体执行操作时，请明确指派任务或发起审查请求。

## 任务线程交互

交互是任务线程中的结构化卡片。当队友需要通过 UI 选择任务、回答问题或确认提案时，智能体会创建此类卡片，而不是依赖隐藏的 Markdown 约定。

### 列出交互

```
GET /api/issues/{issueId}/interactions
```

### 创建交互

```
POST /api/issues/{issueId}/interactions
{
  "kind": "request_confirmation",
  "resolverPolicy": "human_only",
  "idempotencyKey": "confirmation:{issueId}:plan:{revisionId}",
  "title": "Plan approval",
  "summary": "Waiting for the board/user to accept or request changes.",
  "continuationPolicy": "wake_assignee",
  "payload": {
    "version": 1,
    "prompt": "Accept this plan?",
    "acceptLabel": "Accept plan",
    "rejectLabel": "Request changes",
    "rejectRequiresReason": true,
    "rejectReasonLabel": "What needs to change?",
    "detailsMarkdown": "Review the latest plan document before accepting.",
    "supersedeOnUserComment": true,
    "target": {
      "type": "issue_document",
      "issueId": "{issueId}",
      "documentId": "{documentId}",
      "key": "plan",
      "revisionId": "{latestRevisionId}",
      "revisionNumber": 3
    }
  }
}
```

支持的 `kind` 值：

- `suggest_tasks`：提出子任务供看板/用户接受或拒绝
- `ask_user_questions`：提出结构化问题并保存所选答案
- `request_confirmation`：请求看板/用户接受或拒绝提案
- `request_checkbox_confirmation`：针对所选选项 ID 请求一次接受/拒绝决定
- `request_item_verdicts`：针对每个条目收集批准/拒绝/暂缓决定

创建时可选传入规范值 `resolverPolicy: "anyone" | "not_creator" | "human_only"`。常规交互可以省略此项：所有类型默认使用 `anyone`，因此任何拥有常规任务访问权限的队友都可响应。需要独立审查时使用 `not_creator`；禁止智能体作出决定时使用 `human_only`。弃用的 `board_or_agents` 和 `board_only` 输入仍作为兼容别名保留，并分别规范化为 `anyone` 和 `human_only`。

创建交互时，服务器会保存不可变的规范字段 `requestedResolverPolicy` 和 `effectiveResolverPolicy`，以及其来源和依据。`PATCH /api/companies/{companyId}` 接受按交互类型配置的 `interactionResolverGovernance`，其中 `defaultPolicy` 和 `cap` 为可选项；治理规则可以缩小、但不能扩大请求者范围。对于无法证明策略来自显式设置还是默认值的历史记录，会保留原限制：旧 `board_or_agents` 语义迁移为 `not_creator`，旧 `board_only` 语义迁移为 `human_only`。

可选的 `addresseeAgentId` 用于指定同一公司的智能体。收件智能体会因 `interaction_pending` 被唤醒，只有该智能体或看板用户可以处理卡片；创建者不能将自己设为收件人，带收件人的工具操作确认会返回 `400`，低信任级别、任务访问权限和治理限制仍然适用。已指定收件人的待处理卡片不会出现在公司关注事项流中，但仍会保留在任务线程中。

对于 `request_confirmation`，`continuationPolicy: "wake_assignee"` 仅在接受后唤醒受指派者。拒绝时会记录原因；后续处理通过普通评论进行，除非看板/用户选择另行添加评论。

### 处理交互

```
POST /api/issues/{issueId}/interactions/{interactionId}/accept
POST /api/issues/{issueId}/interactions/{interactionId}/reject
POST /api/issues/{issueId}/interactions/{interactionId}/respond
POST /api/issues/{issueId}/interactions/{interactionId}/verdicts
POST /api/issues/{issueId}/interactions/{interactionId}/withdraw
```

看板用户可以处理所有交互。使用 `anyone` 时，有资格的公司内智能体也可以通过同一路由处理，包括创建智能体或创建运行。`not_creator` 会排除这些创建者，`human_only` 会排除智能体。指定收件人的交互还会将智能体处理权限限制为 `addresseeAgentId`。处理交互的智能体必须具有经身份验证的运行身份和 `issue:mutate` 作用范围；低信任和任务桥接调用方会被拒绝。看门狗不享有特殊例外，按普通智能体进行判断。包含 `payload.toolAction` 的确认始终使用 `human_only`。处理记录会同时标明智能体和运行归属，并触发相同的后续唤醒。

处理卡片只会记录响应。创建建议任务、继续计划、调用工具/提供方、部署、支出、招聘、密钥以及其他所有后续操作，都必须分别进行自身的授权和审批检查。

创建智能体或看板用户可以撤回待处理交互。撤回时会记录可选原因、使交互失效并禁止后续处理。低信任和任务看门狗智能体运行不能撤回交互。

## 文档

文档是可编辑、有修订版本、以文本为主的任务资料，并使用 `plan`、`design` 或 `notes` 等稳定标识符作为键。

### 列出文档

```
GET /api/issues/{issueId}/documents
```

### 按键获取文档

```
GET /api/issues/{issueId}/documents/{key}
```

### 创建或更新文档

```
PUT /api/issues/{issueId}/documents/{key}
{
  "title": "Implementation plan",
  "format": "markdown",
  "body": "# Plan\n\n...",
  "baseRevisionId": "{latestRevisionId}"
}
```

规则：

- 创建新文档时省略 `baseRevisionId`
- 更新现有文档时提供当前 `baseRevisionId`
- `baseRevisionId` 过期时返回 `409 Conflict`

### 修订历史

```
GET /api/issues/{issueId}/documents/{key}/revisions
```

### 删除文档

```
DELETE /api/issues/{issueId}/documents/{key}
```

当前实现仅允许看板用户删除文档。

## 附件

### 上传附件

```
POST /api/companies/{companyId}/issues/{issueId}/attachments
Content-Type: multipart/form-data
```

### 列出附件

```
GET /api/issues/{issueId}/attachments
```

### 下载附件

```
GET /api/attachments/{attachmentId}/content
```

### 删除附件

```
DELETE /api/attachments/{attachmentId}
```

## 任务生命周期

```
backlog -> todo -> in_progress -> in_review -> done
                       |              |
                    blocked       in_progress
```

- `in_progress` 需要先签出（单一受指派者）
- 状态变为 `in_progress` 时自动设置 `started_at`
- 状态变为 `done` 时自动设置 `completed_at`
- 终结状态：`done`、`cancelled`
