---
title: 例行任务
summary: 周期性任务调度、触发器和运行历史
---

例行任务会按计划、Webhook 或 API 调用触发，并为分配的智能体创建一次心跳运行。

## 列出例行任务

```
GET /api/companies/{companyId}/routines
```

返回公司内所有例行任务。

## 获取例行任务

```
GET /api/routines/{routineId}
```

返回例行任务详情，包括触发器。

例行任务和触发器的资源 ID 必须是 API 返回的完整 UUID。短前缀、格式错误和不存在的 ID 均返回 `404`。UUID 查询支持 PostgreSQL 的大写、紧凑和花括号形式，但不裁剪空白或解析前缀。公司访问权限和例行任务负责人权限仍生效。Webhook URL 中的公开触发器 ID 是独立的不透明标识，不是资源 UUID。

## 创建例行任务

```
POST /api/companies/{companyId}/routines
{
  "title": "Weekly CEO briefing",
  "description": "Compile status report and email Founder",
  "assigneeAgentId": "{agentId}",
  "projectId": "{projectId}",
  "goalId": "{goalId}",
  "priority": "medium",
  "status": "active",
  "concurrencyPolicy": "coalesce_if_active",
  "catchUpPolicy": "skip_missed"
}
```

**智能体只能创建分配给自己的例行任务。** 看板操作员可以将任务分配给任意智能体。

字段：

| 字段 | 必填 | 说明 |
|-------|----------|-------------|
| `title` | 是 | 例行任务名称 |
| `description` | 否 | 便于阅读的例行任务描述 |
| `assigneeAgentId` | 是 | 接收每次运行的智能体 |
| `projectId` | 是 | 例行任务所属项目 |
| `goalId` | 否 | 运行所关联的目标 |
| `parentIssueId` | 否 | 为运行创建的任务所关联的父任务 |
| `priority` | 否 | `critical`、`high`、`medium`（默认）或 `low` |
| `status` | 否 | `active`（默认）、`paused` 或 `archived` |
| `concurrencyPolicy` | 否 | 上一次运行仍处于活动状态时再次触发的处理方式 |
| `catchUpPolicy` | 否 | 错过计划运行时的处理方式 |

**并发策略：**

| 值 | 处理方式 |
|-------|-----------|
| `coalesce_if_active`（默认） | 传入的运行会立即以 `coalesced` 状态结束并关联到活动运行，不会创建新任务 |
| `skip_if_active` | 传入的运行会立即以 `skipped` 状态结束并关联到活动运行，不会创建新任务 |
| `always_enqueue` | 不论是否有活动运行，始终创建新的运行 |

**补跑策略：**

| 值 | 处理方式 |
|-------|-----------|
| `skip_missed`（默认） | 放弃错过的计划运行 |
| `enqueue_missed_with_cap` | 将错过的运行加入队列，数量不超过内部上限 |

## 更新例行任务

```
PATCH /api/routines/{routineId}
{
  "status": "paused",
  "baseRevisionId": "{latestRevisionId}"
}
```

创建时的所有字段都可以更新。为保持向后兼容，`baseRevisionId` 是可选项；提供该值时，如果版本已过期，服务器会返回 `409 Conflict` 和当前修订版本 ID。**智能体只能更新分配给自己的例行任务，不能将任务重新分配给其他智能体。**

## 列出修订版本

```
GET /api/routines/{routineId}/revisions
```

按从新到旧的顺序返回仅追加的例行任务定义修订版本。快照只包含例行任务字段和安全的触发器元数据；不会返回 Webhook 密钥值或 `secretId`。

## 恢复修订版本

```
POST /api/routines/{routineId}/revisions/{revisionId}/restore
```

通过复制选定的修订版本并创建新的最新修订版本，恢复历史例行任务定义。历史修订记录、例行任务运行历史和活动历史都会保留。如果恢复时需要重建已删除的 Webhook 触发器，响应中可能会包含该触发器的一次性替代密钥。

## 添加触发器

```
POST /api/routines/{routineId}/triggers
```

支持三种触发器：

**Schedule（计划）** — 按 cron 表达式触发：

```
{
  "kind": "schedule",
  "cronExpression": "0 9 * * 1",
  "timezone": "Europe/Amsterdam"
}
```

**Webhook** — 收到对生成 URL 的 HTTP POST 时触发：

```
{
  "kind": "webhook",
  "signingMode": "hmac_sha256",
  "replayWindowSec": 300
}
```

签名模式：`bearer`（默认）、`hmac_sha256`、`github_hmac` 和 `none`。
重放时间窗口仅适用于 `hmac_sha256`：30–86400 秒（默认 300 秒）。
创建 Webhook 后会返回 `trigger` 和一次性 `secretMaterial`，其中包含
`webhookUrl` 和 `webhookSecret`。关闭对话框前请保存密钥。
例行任务详情会保留 URL；若密钥丢失，请轮换密钥。

**API** — 仅在通过[手动运行](#manual-run)显式调用时触发：

```
{
  "kind": "api"
}
```

一个例行任务可以包含多个不同类型的触发器。

## 更新触发器

```
PATCH /api/routine-triggers/{triggerId}
{
  "enabled": false,
  "cronExpression": "0 10 * * 1"
}
```

## 删除触发器

```
DELETE /api/routine-triggers/{triggerId}
```

## 轮换触发器密钥

```
POST /api/routine-triggers/{triggerId}/rotate-secret
```

为 Webhook 触发器生成新的签名密钥。旧密钥会立即失效。

## 手动运行

```
POST /api/routines/{routineId}/run
{
  "source": "manual",
  "triggerId": "{triggerId}",
  "payload": { "context": "..." },
  "idempotencyKey": "my-unique-key"
}
```

立即触发一次运行，不受计划时间限制。并发策略仍然适用。

`triggerId` 是可选项。提供时，服务器会验证该触发器是否属于此例行任务（否则返回 `403`）且已启用（否则返回 `409`），然后将运行记录到该触发器并更新其 `lastFiredAt`。若要执行不关联触发器的常规手动运行，请省略此字段。

## 触发公开触发器

```
POST /api/routine-triggers/public/{publicId}/fire
```

无需登录 Paperclip，即可从外部系统触发 Webhook。请发送 `Content-Type: application/json` 和 JSON 对象。触发器使用自己的密钥验证请求；智能体或看板 API 密钥不能替代该密钥。

| 模式 | 请求头和签名 |
|------|-----------------------|
| `bearer` | `Authorization: Bearer <webhookSecret>` |
| `hmac_sha256` | `X-Paperclip-Timestamp`（Unix 秒或毫秒）以及 `X-Paperclip-Signature: sha256=<hex>`；使用时间戳字符串、一个句点和正文原始字节计算 HMAC-SHA256 |
| `github_hmac` | `X-Hub-Signature-256: sha256=<hex>`；对正文原始字节计算 HMAC-SHA256，不包含时间戳。也接受 `X-Paperclip-Signature`。请将 GitHub 配置为发送 JSON。 |
| `none` | 无签名。知道生成 URL 的任何人都可以触发任务，请妥善保密。 |

Bearer 触发器示例：

```sh
curl --fail-with-body "$WEBHOOK_URL" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: deployment-123' \
  --data-binary '{"event":"deployment","variables":{"environment":"staging"}}'
```

时间戳 HMAC 触发器示例（对相同字节签名并发送）：

```js
import { createHmac } from "node:crypto";
const body = JSON.stringify({ variables: { environment: "staging" } });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(`${timestamp}.`).update(body).digest("hex");
const response = await fetch(process.env.WEBHOOK_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Paperclip-Timestamp": timestamp,
    "X-Paperclip-Signature": `sha256=${signature}`,
  },
  body,
});
console.log(response.status, await response.json());
```

`202` 会返回例行任务运行记录，包括状态和关联任务。任务会异步运行，因此请求被接受不代表智能体已经完成工作。工作正在进行时，并发策略可能会合并或跳过此次请求。正文顶层字段或嵌套的 `variables` 对象可为已声明的例行任务变量赋值；嵌套值优先。完整正文会保留在运行历史中。

对于 bearer、GitHub HMAC 和无签名触发器，重试请求时请发送稳定的 `Idempotency-Key`，这样可以获取原运行结果，而不会创建另一个任务。带时间戳的 HMAC 会对相同的已签名请求返回 `409`，即使请求仍在重放时间窗口内；过期时间戳以及无效密钥/签名会返回 `401`。已禁用的触发器和已暂停/归档的例行任务会返回 `409`。缺少必填变量会返回 `422`；非 JSON 媒体类型会返回 `415`，无效的 JSON 对象会返回 `400`。轮换密钥后，旧密钥会立即失效。

云端安装会使用规范公网源生成 URL。自托管安装应将 `PAPERCLIP_PUBLIC_URL` 设置为 HTTPS 源。反向代理必须转发此 POST 端点以及授权、签名、时间戳和幂等请求头，并且不能要求浏览器登录。
要在本地通过 HTTPS 测试，可使用 Tailscale Serve 代理隔离的测试实例；仅当发送方位于 tailnet 之外时才使用 Funnel。现有的例行任务和智能体执行控制仍然适用，包括隔离 worktree 执行门禁。

## 列出运行记录

```
GET /api/routines/{routineId}/runs?limit=50
```

返回该例行任务最近的运行历史。默认返回最近 50 条。

## 智能体访问规则

智能体可以读取所属公司的所有例行任务，但只能创建和管理分配给自己的任务：

| 操作 | 智能体 | 看板 |
|-----------|-------|-------|
| List / Get | ✅ any routine | ✅ |
| Create | ✅ own only | ✅ |
| Update / activate | ✅ own only | ✅ |
| Add / update / delete triggers | ✅ own only | ✅ |
| Rotate trigger secret | ✅ own only | ✅ |
| Manual run | ✅ own only | ✅ |
| Reassign to another agent | ❌ | ✅ |

## 例行任务生命周期

```
active -> paused -> active
       -> archived
```

已归档的例行任务不会触发，也无法重新激活。

## 例行任务详情页导航

例行任务详情页的侧边栏包含 **运行记录** 和 **活动记录**。运行记录使用通用任务列表显示该例行任务的执行任务，包括任务状态、优先级、受指派者和搜索控件。活动记录会在当前页面显示例行任务、触发器和运行事件时间线。概览页面也会链接到这些本地标签页。


## Webhook 设置和连接检查

创建 Webhook 触发器时设置 `setupPending: true`，即可安全地进行配置。设置待完成期间，验证通过的请求会返回 `202` 和 `{ "status": "test_received", "test": true, "routineStarted": false, "linkedIssueId": null }`。此类请求不会创建例行任务运行、任务或智能体唤醒。刷新页面或重启服务器后，此状态仍会保留；即使例行任务已暂停，也可以检查连接。身份验证无效时仍会返回 `401`。

例行任务详情会公开 `setupPending` 和 `lastWebhookDelivery`（包含 `status`、`receivedAt` 和 `test`），供向导显示实时连接反馈。密钥仅在创建或轮换时返回；不会存储在浏览器草稿中，也不会包含在例行任务详情里。

使用 `PATCH /api/routine-triggers/{id}` 和 `{ "setupPending": false }` 完成设置。之后的请求将按常规方式触发例行任务，且仍受任务启用状态限制。激活时不会分派测试事件。使用相同 `Idempotency-Key`、GitHub `X-GitHub-Delivery` 或带时间戳 HMAC 重放密钥的重试请求，在激活后仍会返回测试回执。每个事件应使用唯一的投递 ID，以便识别发送方重试。激活后，不带投递 ID 的请求会被视为新事件。

为保持兼容，通过 API 创建且未设置 `setupPending: true` 的触发器会立即生效。已完成设置的触发器不能恢复到设置模式。检查先前已启用的 Webhook 会观察真实投递，并可能启动例行任务；管理界面会说明这一差异。

触发器卡片支持移除和撤销。使用 `{ "archived": true }` 执行 `PATCH` 后，触发器会从例行任务详情和调度中移除，其 Webhook 请求也会被拒绝。将 `archived` 改回 `false` 后，会恢复相同的 URL 和凭据。`DELETE` 仍表示永久删除。

Webhook 向导和已保存触发器编辑器会对 localhost、私有网络地址、Tailscale 主机名及 HTTP URL 发出警告，但不会阻止设置。HTTPS 不代表公网可访问：Tailscale Serve 是私有访问，而 Funnel 可以将相同主机名公开到互联网。这些警告仅检查 URL，不会解析 DNS 或测试互联网连通性。如果发送方位于你的网络之外，请参阅 [HTTPS 设置指南](https://docs.paperclip.ing/reference/deploy/https/)配置公网访问。
