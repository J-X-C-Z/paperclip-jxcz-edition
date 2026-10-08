---
title: 部署概览
summary: 快速了解部署模式
---

Paperclip 支持三种部署配置，涵盖开箱即用的本地使用和面向互联网的生产环境。

## 部署模式

| 模式 | 身份验证 | 适用场景 |
|------|------|----------|
| `local_trusted` | No login required | Single-operator local machine |
| `authenticated` + `private` | Login required | Private network (Tailscale, VPN, LAN) |
| `authenticated` + `public` | Login required | Internet-facing cloud deployment |

## 快速对比

### 本地可信（默认）

- 仅绑定回环地址（localhost）
- 无需人工登录
- 本地启动最快
- 适用于：个人开发和实验

### 已认证 + 私有网络

- 通过 Better Auth 登录
- 绑定所有网络接口以便访问
- 自动基准 URL 模式，配置更简单
- 适用于：通过 Tailscale 或本地网络供团队访问

### 已认证 + 公网

- 需要登录
- 必须指定公网 URL
- 安全检查更严格
- 适用于：云托管和面向互联网的部署

## 选择模式

- **只是想试用 Paperclip？** 使用默认的 `local_trusted`。
- **要在私有网络中与团队共享？** 使用 `authenticated` + `private`。
- **要部署到云端？** 使用 `authenticated` + `public`，请参阅 [AWS ECS Fargate 指南](aws-ecs.md)。

初始化时设置模式：

```sh
pnpm paperclipai onboard
```

也可稍后修改：

```sh
pnpm paperclipai configure --section server
```
