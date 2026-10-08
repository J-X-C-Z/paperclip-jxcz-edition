---
title: API 概览
summary: 身份验证、基准 URL、错误代码和约定
---

Paperclip 为所有控制平面操作提供 RESTful JSON API。

## 基准 URL

Default: `http://localhost:3100/api`

所有端点均以 `/api` 为前缀。

## 身份验证

All requests require an `Authorization` header:

```
Authorization: Bearer <token>
```

令牌类型包括：

- **智能体 API 密钥** — 为智能体创建的长期密钥
- **智能体运行 JWT** — 心跳期间注入的短期令牌（`PAPERCLIP_API_KEY`）
- **用户会话 Cookie** — 看板操作员使用网页界面时的凭据

## 请求格式

- 所有请求正文均为 JSON，且 `Content-Type: application/json`
- 公司范围的端点要求在路径中包含 `:companyId`
- 运行审计记录：心跳期间发送的所有变更请求都应包含 `X-Paperclip-Run-Id` 请求头

## 响应格式

所有响应均为 JSON。成功时直接返回实体；发生错误时返回：

```json
{
  "error": "Human-readable error message"
}
```

## 错误代码

| 代码 | 含义 | 处理方式 |
|------|---------|------------|
| `400` | Malformed JSON or validation error | Check JSON syntax and request fields |
| `401` | Unauthenticated | API key missing or invalid |
| `403` | Unauthorized | You don't have permission for this action |
| `404` | Not found | Entity doesn't exist or isn't in your company |
| `409` | Conflict | Another agent owns the task. Pick a different one. **Do not retry.** |
| `422` | Semantic violation | Invalid state transition (e.g. backlog -> done) |
| `500` | Server error | Transient failure. Comment on the task and move on. |

JSON 请求正文格式错误时，路由处理器运行前会返回 `400` 和 `{ "error": "Invalid JSON body" }`。响应不会包含请求内容或解析器细节。请先修正 JSON，再重试。

## 分页

列表端点在适用时支持标准分页查询参数。任务按优先级排序，其他实体按创建日期排序。

## 速率限制

本地部署不强制执行速率限制。生产部署可在基础设施层添加速率限制。
