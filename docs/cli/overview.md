---
title: CLI 概览
summary: CLI 安装与设置
---

Paperclip CLI 用于实例设置、诊断和控制平面操作。

## 用法

```sh
pnpm paperclipai --help
```

## 全局选项

All commands support:

| 参数 | 说明 |
|------|-------------|
| `--data-dir <path>` | Local Paperclip data root (isolates from `~/.paperclip`) |
| `--api-base <url>` | API base URL |
| `--api-key <token>` | API authentication token |
| `--context <path>` | Context file path |
| `--profile <name>` | Context profile name |
| `--json` | Output as JSON |

以公司为范围的命令还接受 `--company-id <id>`。

要使用独立的本地实例，请在命令中传入 `--data-dir`：

```sh
npx paperclipai run --data-dir ./tmp/paperclip-dev
```

## 上下文配置档

保存默认值，避免重复输入参数：

```sh
# 设置默认值
npx paperclipai context set --api-base http://localhost:3100 --company-id <id>

# 查看当前上下文
pnpm paperclipai context show

# 列出配置档
pnpm paperclipai context list

# 切换配置档
npx paperclipai context use default
```

如需避免在上下文中保存密钥，请使用环境变量：

```sh
npx paperclipai context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```

密钥操作通过 `paperclipai secrets` 提供：

```sh
npx paperclipai secrets declarations --company-id <company-id> --kind secret
npx paperclipai secrets create --company-id <company-id> --name anthropic-api-key --value-env ANTHROPIC_API_KEY
npx paperclipai secrets link --company-id <company-id> --name prod-stripe-key --provider aws_secrets_manager --external-ref <provider-ref>
npx paperclipai secrets doctor --company-id <company-id>
npx paperclipai secrets migrate-inline-env --company-id <company-id> --apply
```

上下文保存在 `~/.paperclip/context.json`。

## 命令类别

CLI 命令分为两类：

1. **[设置命令](/cli/setup-commands)** — 实例初始化、诊断和配置
2. **[控制平面命令](/cli/control-plane-commands)** — 任务、智能体、审批和活动记录
