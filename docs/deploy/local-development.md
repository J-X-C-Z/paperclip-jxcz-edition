---
title: 本地开发
summary: 配置 Paperclip 本地开发环境
---

无需外部依赖即可在本地运行 Paperclip。

## 前置条件

- Node.js 24.11+
- pnpm 9+

## 启动开发服务器

```sh
pnpm install
pnpm dev
```

启动后会运行：

- **API 服务器**：`http://localhost:3100`
- **UI**：由 API 服务器以开发中间件模式提供（同源）

无需 Docker 或外部数据库。Paperclip 会自动使用内嵌 PostgreSQL。

## 一条命令完成初始化

首次安装时运行：

```sh
pnpm paperclipai run
```

此命令会：

1. 配置缺失时自动运行初始化
2. 运行启用修复功能的 `paperclipai doctor`
3. 检查通过后启动服务器

## 开发环境中的 Bind 预设

默认情况下，`pnpm dev` 使用 `local_trusted` 模式，并且只绑定回环地址。

要在私有网络中开放 Paperclip 并启用登录：

```sh
pnpm dev --bind lan
```

要仅绑定到检测到的 tailnet 地址（Tailscale 网络）：

```sh
pnpm dev --bind tailnet
```

旧别名仍可使用，并映射到旧版的宽泛私有网络行为：

```sh
pnpm dev --tailscale-auth
pnpm dev --authenticated-private
```

允许其他私有主机名：

```sh
npx paperclipai allowed-hostname dotta-macbook-pro
```

完整设置和故障排查说明请参阅 [Tailscale 私有网络访问](/deploy/tailscale-private-access)。

## 健康检查

```sh
curl http://localhost:3100/api/health
# -> {"status":"ok"}

curl http://localhost:3100/api/companies
# -> []
```

## 为本地智能体运行安全地初始化 Worktree

为安全地并行进行本地实验，请初始化专用 worktree 实例，而不要复用主工作区：

```sh
npx paperclipai worktree:make local-lab --seed-mode minimal
cd ~/paperclip-local-lab
pnpm paperclipai worktree env                       # inspect generated env exports
eval "$(npx paperclipai worktree env)"             # bash/zsh
pnpm paperclipai run
pnpm paperclipai doctor
```

如果实验环境变得混乱，可修复或重新播种 worktree，而不影响主分支：

```sh
# worktree repair 会重建本地检出元数据，因此请通过 direct-exec 形式运行当前检出的 CLI。
node cli/node_modules/tsx/dist/cli.mjs cli/src/index.ts worktree repair --branch paperclip-local-lab
npx paperclipai worktree reseed --from . --to paperclip-local-lab
```

完成后，关闭实例并显式移除隔离状态：

```sh
npx paperclipai worktree:cleanup local-lab --force
```

## 重置开发数据

要清除本地数据并重新开始：

```sh
rm -rf ~/.paperclip/instances/default/db
pnpm dev
```

## 数据位置

| 数据 | 路径 |
|------|------|
| Config | `~/.paperclip/instances/default/config.json` |
| Database | `~/.paperclip/instances/default/db` |
| Storage | `~/.paperclip/instances/default/data/storage` |
| Secrets key | `~/.paperclip/instances/default/secrets/master.key` |
| Logs | `~/.paperclip/instances/default/logs` |

通过环境变量覆盖：

```sh
PAPERCLIP_HOME=/custom/path PAPERCLIP_INSTANCE_ID=dev pnpm paperclipai run
```
