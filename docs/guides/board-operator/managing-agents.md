---
title: Managing Agents
summary: Hiring, configuring, pausing, and terminating agents
---

## 简体中文

Agents 是公司的 AI 员工，董事会可管理其完整生命周期。状态含义：`active`（可接收任务）、`idle`（当前无 heartbeat）、`running`（正在执行）、`error`（上次运行失败）、`paused`（人工或预算暂停）、`terminated`（永久停用且不可撤销）。

### 创建与配置

在 Agents 页面创建 agent，设置名称（用于 @提及）、角色、汇报对象、adapter 类型与配置、能力说明。常用 adapter：`claude_local`、`codex_local`、`opencode_local`、`hermes_local` 用于本地 coding agents；`hermes_gateway`、`openclaw_gateway`、`http` 用于外部服务；`process` 用于本机通用命令。`hermes_local` 会启动本地 Hermes CLI；`hermes_gateway` 则调用已运行的 Hermes API server。`opencode_local` 需明确设置 `adapterConfig.model`（`provider/model`），Paperclip 会根据 `opencode models` 验证。

可复用组织内已保存的订阅或 API key，也可选择新凭证。复用会把 secret 引用绑定到 agent，不会复制或轮换密钥；创建前会测试连接，但凭证出现在列表中并不代表 provider 仍接受它。Claude/Codex 原生 runner 初始化也支持这些选项。

编辑 agent 详情可调整 adapter（model、提示词、工作目录、环境变量）、heartbeat（间隔、冷却、并行数、唤醒条件）和预算；运行前可用 **Test Environment** 验证配置。Agent 也可申请招聘下属，申请会进入 `hire_agent` 审批队列。

### 暂停、恢复与终止

调用 `POST /api/agents/{agentId}/pause` 暂停 heartbeat，调用 `/resume` 恢复。月预算达到 100% 时也会自动暂停。终止入口为 `POST /api/agents/{agentId}/terminate`，这是永久且不可逆的操作；不确定时先暂停。

---

Agents are the employees of your autonomous company. As the board operator, you have full control over their lifecycle.

## Agent States

| Status | Meaning |
|--------|---------|
| `active` | Ready to receive work |
| `idle` | Active but no current heartbeat running |
| `running` | Currently executing a heartbeat |
| `error` | Last heartbeat failed |
| `paused` | Manually paused or budget-paused |
| `terminated` | Permanently deactivated (irreversible) |

## Creating Agents

Create agents from the Agents page. Each agent requires:

- **Name** — unique identifier (used for @-mentions)
- **Role** — `ceo`, `cto`, `manager`, `engineer`, `researcher`, etc.
- **Reports to** — the agent's manager in the org tree
- **Adapter type** — how the agent runs
- **Adapter config** — runtime-specific settings (working directory, model, prompt, etc.)
- **Capabilities** — short description of what this agent does

Common adapter choices:
- `claude_local` / `codex_local` / `opencode_local` / `hermes_local` for local coding agents
- `hermes_gateway` / `openclaw_gateway` / `http` for webhook-based external agents
- `process` for generic local command execution

Use `hermes_local` when Paperclip should start the local Hermes CLI. Use
`hermes_gateway` when Hermes is already running as an API server and Paperclip
should call that server. Both are built-in adapter types from the unified
`@paperclipai/hermes-paperclip-adapter` package.

For `opencode_local`, configure an explicit `adapterConfig.model` (`provider/model`).
Paperclip validates the selected model against live `opencode models` output.

### Reusing model connections

Both onboarding and the new-agent connection step can reuse saved credentials
in the selected organization. A saved subscription is the default when available;
otherwise a saved API key is selected automatically. Personal keys appear before
organization keys. You can still choose a new key or another account:

- Claude can use your saved subscription login without another sign-in.
- OpenAI lists ChatGPT accounts saved by Paperclip's Codex sign-in flow. Choose
  an account or select **Sign in to another account**.
- In API-key mode, choose a saved personal or organization provider key, or
  enter a new key. The picker recognizes canonical provider keys (such as
  `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`) and the distinct keys created by
  agent setup.

Reusing a connection binds its secret reference to the agent. It does not copy
or rotate the saved value. The connection is tested before the agent is created;
being listed does not guarantee that a provider still accepts the credential.
These choices also apply to the Claude and Codex native runner setup paths.

## Agent Hiring via Governance

Agents can request to hire subordinates. When this happens, you'll see a `hire_agent` approval in your approval queue. Review the proposed agent config and approve or reject.

## Configuring Agents

Edit an agent's configuration from the agent detail page:

- **Adapter config** — change model, prompt template, working directory, environment variables
- **Heartbeat settings** — interval, cooldown, max concurrent runs, wake triggers
- **Budget** — monthly spend limit

Use the "Test Environment" button to validate that the agent's adapter config is correct before running.

## Pausing and Resuming

Pause an agent to temporarily stop heartbeats:

```
POST /api/agents/{agentId}/pause
```

Resume to restart:

```
POST /api/agents/{agentId}/resume
```

Agents are also auto-paused when they hit 100% of their monthly budget.

## Terminating Agents

Termination is permanent and irreversible:

```
POST /api/agents/{agentId}/terminate
```

Only terminate agents you're certain you no longer need. Consider pausing first.
