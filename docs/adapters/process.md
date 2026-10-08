---
title: Process 适配器
summary: 通用 Shell 进程适配器
---

`process` 适配器可执行任意 shell 命令，适用于简单脚本、单次任务或基于自定义框架构建的智能体。

## 适用场景

- 运行调用 Paperclip API 的 Python 脚本
- 执行自定义智能体循环
- 任何可通过 shell 命令调用的运行时

## 不适用场景

- 需要在多次运行间保留会话时（请使用 `claude_local` 或 `codex_local`）
- 智能体需要在不同心跳之间保留对话上下文时

## 配置

| 字段 | 类型 | 必填 | 说明 |
|-------|------|----------|-------------|
| `command` | string | 是 | 要执行的 Shell 命令 |
| `cwd` | string | 否 | 工作目录 |
| `env` | object | 否 | 环境变量 |
| `timeoutSec` | number | 否 | 进程超时时间 |

## 工作方式

1. Paperclip 将配置的命令作为子进程启动
2. 注入标准 Paperclip 环境变量（`PAPERCLIP_AGENT_ID`、`PAPERCLIP_API_KEY` 等）
3. 进程运行直至结束
4. 根据退出代码判断成功或失败

## 示例

运行 Python 脚本的智能体：

```json
{
  "adapterType": "process",
  "adapterConfig": {
    "command": "python3 /path/to/agent.py",
    "cwd": "/path/to/workspace",
    "timeoutSec": 300
  }
}
```

脚本可以使用注入的环境变量向 Paperclip API 进行身份验证并执行工作。
