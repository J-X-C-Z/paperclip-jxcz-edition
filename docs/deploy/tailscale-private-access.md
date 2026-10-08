---
title: Tailscale 私有网络访问
summary: 使用适配 Tailscale 的绑定预设运行 Paperclip，并从其他设备连接
---

如果需要通过 Tailscale（或私有局域网/VPN）访问 Paperclip，而非仅使用 `localhost`，请参照此指南。

## 1. 以私有已认证模式启动 Paperclip

```sh
pnpm dev --bind tailnet
```

推荐配置：

- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`
- `PAPERCLIP_BIND=tailnet`

如果希望使用旧版宽泛私有网络行为，请运行：

```sh
pnpm dev --bind lan
```

旧别名仍映射到 `authenticated/private + bind=lan`：

```sh
pnpm dev --authenticated-private
pnpm dev --tailscale-auth
```

## 2. 查找可访问的 Tailscale 地址

在运行 Paperclip 的机器上执行：

```sh
tailscale ip -4
```

也可以使用 Tailscale MagicDNS 主机名（例如 `my-macbook.tailnet.ts.net`）。

## 3. 从其他设备打开 Paperclip

将 Tailscale IP 或 MagicDNS 主机名与 Paperclip 端口组合使用：

```txt
http://<tailscale-host-or-ip>:3100
```

示例：

```txt
http://my-macbook.tailnet.ts.net:3100
```

## 4. 按需放行自定义私有主机名

如果通过自定义私有主机名访问 Paperclip，请将其加入允许列表：

```sh
npx paperclipai allowed-hostname my-macbook.tailnet.ts.net
```

## 5. 验证服务器可访问

在已连接 Tailscale 的远程设备上执行：

```sh
curl http://<tailscale-host-or-ip>:3100/api/health
```

预期结果：

```json
{"status":"ok"}
```

## 故障排查

- 私有主机名出现登录或重定向错误：使用 `paperclipai allowed-hostname` 添加该主机名。
- 应用只能通过 `localhost` 使用：确认启动时传入了 `--bind lan` 或 `--bind tailnet`，而非直接运行 `pnpm dev`。
- 本机可以连接、远程设备无法连接：确认两台设备位于同一 Tailscale 网络，且端口 `3100` 可访问。
