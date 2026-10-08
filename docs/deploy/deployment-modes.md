---
title: 部署模式
summary: local_trusted 与 authenticated（私有/公网）
---

Paperclip 支持两种安全属性不同的运行模式。网络可访问性通过 `bind` 单独配置。

## `local_trusted`

默认模式，适用于单人本地使用。

- **主机绑定**：仅限回环地址（localhost）
- **Bind**：`loopback`
- **身份验证**：无需登录
- **适用场景**：本地开发、个人实验
- **看板身份**：自动创建本地看板用户

```sh
# 在初始化时设置
pnpm paperclipai onboard
# 选择 "local_trusted"
```

## `authenticated`

需要登录，支持两种网络暴露策略。

### `authenticated` + `private`

用于私有网络访问（Tailscale、VPN、局域网）。

- **身份验证**：通过 Better Auth 登录
- **URL 处理**：自动基准 URL 模式，减少配置步骤
- **主机信任**：需要配置私有主机信任策略
- **Bind**：可选 `loopback`、`lan`、`tailnet` 或 `custom`

```sh
pnpm paperclipai onboard
# 选择 "authenticated" -> "private"
```

允许自定义 Tailscale 主机名：

```sh
npx paperclipai allowed-hostname my-machine
```

### `authenticated` + `public`

用于面向互联网的部署。

- **身份验证**：需要登录
- **URL**：必须指定公网 URL
- **安全性**：doctor 会执行更严格的部署检查
- **Bind**：通常在反向代理后使用 `loopback`；`lan/custom` 属于高级配置

```sh
pnpm paperclipai onboard
# 选择 "authenticated" -> "public"
```

## 看板所有权认领流程

从 `local_trusted` 迁移到 `authenticated` 时，Paperclip 会在启动时生成一次性认领 URL：

```
/board-claim/<token>?code=<code>
```

已登录用户访问此 URL 后即可认领看板所有权。此流程会：

- 将当前用户提升为实例管理员
- 将自动创建的本地看板管理员降级
- 确保认领用户具有有效的公司成员身份

## 更改模式

更新部署模式：

```sh
pnpm paperclipai configure --section server
```

通过环境变量覆盖运行时配置：

```sh
PAPERCLIP_DEPLOYMENT_MODE=authenticated PAPERCLIP_BIND=lan pnpm paperclipai run
```
