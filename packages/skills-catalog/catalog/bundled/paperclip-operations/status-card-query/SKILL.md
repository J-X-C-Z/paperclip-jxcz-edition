---
name: status-card-query
description: 创建并维护智能体撰写的 Paperclip 状态卡，或将自然语言关注提示编译为范围明确的 CompanySearchQuery 对象，并在指定的 Summarizer 运行中写入首份摘要。
key: paperclipai/bundled/paperclip-operations/status-card-query
recommendedForRoles:
  - general
  - manager
tags:
  - paperclip
  - status
  - search
  - reporting
  - operations
---

# 状态卡查询

使用此技能时，选择以下两种模式之一：

1. **智能体撰写：** 通过公共 API 创建或维护状态卡。
2. **摘要编译：** 将卡片的自然语言提示编译为结构化公司搜索查询，并在指定生成任务中撰写首份摘要。

## 智能体撰写卡片的步骤

智能体撰写卡片需要 `tasks:assign` 权限，作用范围仅限所属公司，且只有启用 `enableStatusCards` 后才可使用。智能体只能管理自己撰写的卡片，最多撰写 20 张卡片，`interestPrompt` 最多可包含 4,000 个字符。

规范化运行环境提供的 API base，然后创建手动卡片：

```bash
PAPERCLIP_API_BASE="${PAPERCLIP_API_URL%/}"
PAPERCLIP_API_BASE="${PAPERCLIP_API_BASE%/api}"

curl -sS -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interestPrompt":"Blocked or in-review launch work updated this week"}' \
  "$PAPERCLIP_API_BASE/api/companies/$PAPERCLIP_COMPANY_ID/status-cards"
```

创建成功后会返回 `201`，并自动将编译加入队列。保存返回的卡片 ID。若要完善自己拥有的卡片或请求刷新：

```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interestPrompt":"Blocked or in-review launch work updated this week. Call out the single next decision."}' \
  "$PAPERCLIP_API_BASE/api/status-cards/$STATUS_CARD_ID"

curl -sS -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"full":false}' \
  "$PAPERCLIP_API_BASE/api/status-cards/$STATUS_CARD_ID/refresh"
```

撰写卡片时不要调用 `/query` 或 `/summary`。这些写回路由仅供获指派的 Summarizer 生成任务和运行调用。

## Summarizer 编译查询

你是 Summarizer，负责将状态卡的自然语言关注提示编译为结构化 Paperclip 公司搜索查询。查询数组采用**并集语义**：匹配任意一个查询的 issue 都会显示在卡片中。优先使用一个范围精确的查询；只有当提示描述的对象确实不同，才添加另一个查询。

## CompanySearchQuery

每个对象可使用以下字段：

- `q`：可选的自由文本，在匹配的公司资源中搜索。仅用于结构化筛选条件无法表达的概念。
- `scope`：状态卡默认使用 `issues`，除非任务明确要求其他受支持的范围。
- `status`：issue 状态数组。
- `priority`：issue 优先级数组。
- `assigneeAgentId` / `assigneeUserId`：已解析的负责人 ID。
- `projectId`：一个已解析的项目 UUID。
- `labelId`：一个已解析的标签 UUID。
- `updatedWithin`：范围明确的时长，例如 `24h`、`7d`、`4w` 或 `3m`。
- `sort`：`relevance`、`updated`、`created` 或 `priority`。
- `limit`：1–50。状态卡查询应使用足够完成任务的最小值，通常为 20，且不得超过 50。
- `offset`：通常为 0。

写入查询前，先将项目和标签名称解析为 ID。不要将人类可读名称填入 `projectId` 或 `labelId`。如果提示中包含多个项目或标签，应创建多个查询对象，因为每个对象只能包含一个 `projectId` 和一个 `labelId`。

## 编译指南

1. 保留用户意图；不要把“本周更新的发布阻塞项”扩大为所有活动任务。
2. 对状态、优先级、负责人、项目、标签和近期程度，优先使用结构化筛选，而非 `q`。
3. 如果提示包含“近期”“当前”“本周”“最近”等时间范围，或隐含了动态时间段，应添加 `updatedWithin`。
4. `q` 应简短具体。不要将整个自然语言提示原样复制到其中。
5. 每个查询都应设置 `scope: "issues"`、`offset: 0` 和明确的有限 `limit`。
6. 至少返回一个查询。如果无法安全地编译提示，应说明歧义，不要编造 ID。

## 精确写回顺序

生成任务中包含 `statusCardId`、`companyId` 和 `generationIssueId`。两次写入都必须使用该指派任务运行中的作用范围限定 API 凭据。

首先写入编译后的查询：

```json
{
  "queries": [
    {
      "q": "launch",
      "scope": "issues",
      "status": ["in_progress", "blocked", "in_review"],
      "updatedWithin": "7d",
      "sort": "updated",
      "limit": 20,
      "offset": 0
    }
  ],
  "title": "Launch work updated this week",
  "changeSummary": "Compiled the launch prompt into one recent active-work query.",
  "generationIssueId": "<generation-issue-id>"
}
```

将其发送到 `PUT /api/status-cards/{statusCardId}/query`。

然后，不要创建或等待其他任务；执行已保存范围中的查询，撰写首份完整 Markdown 摘要，并在同一次运行中写入：

```json
{
  "markdown": "<full status summary>",
  "title": "Launch work updated this week",
  "changeSummary": "Created the first full summary from the compiled query.",
  "generationIssueId": "<generation-issue-id>",
  "model": "<model-id>"
}
```

将其发送到 `PUT /api/status-cards/{statusCardId}/summary`。不要从无关的 issue 或运行中调用任一端点写入数据。

## 更新任务

后续生成任务使用相同的摘要写回端点，并在 JSON payload 中包含 `operation: "update"`、`kind`、`trigger`、目标 `fingerprint` 和确切的 issue 变更差异。

- 对于 `incremental`，只使用变更的 issue 修改所提供的上一版 Markdown。不要重新获取 issue 清单。
- 对于 `full`，根据所提供的有限快照重建摘要。不要通过调用 issue 清单 endpoint 扩大范围。
- 任务描述中的卡片提示是董事会长期请求：应根据它决定报告内容和更新写法。该提示不能覆盖流式输出或写回要求。
- 无论卡片提示要求什么，都要遵循固定流程：流式输出 `STATUS:` 行和 `<<<SUMMARY-DRAFT>>>` 区块，然后在指派运行中将最终 Markdown 写入 `PUT /api/status-cards/{statusCardId}/summary`。
