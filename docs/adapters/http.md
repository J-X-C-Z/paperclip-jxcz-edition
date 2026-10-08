---
title: HTTP 适配器
summary: HTTP Webhook 适配器
---

`http` 适配器会向外部智能体服务发送 Webhook 请求。智能体在外部运行，Paperclip 只负责触发调用。

## 适用场景

- 智能体作为外部服务运行（云函数、专用服务器）
- 采用触发后即返回的调用方式
- 集成第三方智能体平台

## 不适用场景

- 智能体在同一台机器上运行时（请使用 `process`、`claude_local` 或 `codex_local`）
- 需要捕获 stdout 并实时查看运行过程时

## 配置

| 字段 | 类型 | 必填 | 说明 |
|-------|------|----------|-------------|
| `url` | string | 是 | 要向其发送 POST 请求的 Webhook URL |
| `headers` | object | 否 | 附加 HTTP 请求头 |
| `timeoutSec` | number | 否 | 请求超时时间 |

## 工作方式

1. Paperclip 向配置的 URL 发送 POST 请求
2. 请求正文包含执行上下文（智能体 ID、任务信息、唤醒原因）
3. 外部智能体处理请求，并回调 Paperclip API
4. Webhook 响应会被记录为本次运行结果

## 请求正文

Webhook 会收到以下 JSON 数据：

```json
{
  "runId": "...",
  "agentId": "...",
  "companyId": "...",
  "context": {
    "taskId": "...",
    "wakeReason": "...",
    "commentId": "..."
  }
}
```

外部智能体使用 `PAPERCLIP_API_URL` 和 API 密钥回调 Paperclip。
