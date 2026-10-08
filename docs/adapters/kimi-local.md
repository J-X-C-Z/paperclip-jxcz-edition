---
title: Kimi Code CLI
summary: Kimi Code CLI 本地适配器的设置与配置
---

`kimi_local` adapter 在本地运行 Kimi Code CLI（`kimi`）。它有两种执行引擎：默认的 **ACP 引擎**（`kimi acp`，实时流式传输对话记录和工具状态，行为与 `claude_local`/`gemini_local` 一致），以及通过 `engine: cli` 显式选择的 **CLI 通道**（`kimi -p --output-format stream-json`）。支持会话持久化、通过 `--skills-dir` 按次运行传递技能、思考力度控制和结构化输出解析。

<a id="prerequisites"></a>

## 前置条件

- 已安装 Kimi Code CLI（可用 `kimi` 命令；npm package 为 `@moonshot-ai/kimi-code`）
- 使用以下任一方式配置认证：
  - `kimi login`（OAuth 设备授权流程；凭据存储在 `$KIMI_CODE_HOME` 下，默认目录为 `~/.kimi-code/`）
  - 在 Kimi 的 `config.toml` 中配置 provider（`[providers.<name>]`）
  - 设置 `KIMI_MODEL_NAME` 和 `KIMI_MODEL_API_KEY` 环境变量对（可选设置 `KIMI_MODEL_BASE_URL`、`KIMI_MODEL_PROVIDER_TYPE`），在 adapter `env` 或服务器 shell 中配置

<a id="configuration-fields"></a>

## 配置字段

| 字段 | 类型 | 必需 | 说明 |
|-------|------|----------|-------------|
| `engine` | string | 否 | 执行引擎：`acp`（默认；通过 `kimi acp` 使用流式 ACP 通道）、`cli`（无头 `kimi -p` 通道），或留空/设为 `auto`（使用 ACP；缺少前置条件时运行失败）。 |
| `cwd` | string | 是 | Agent 进程的工作目录（绝对路径；如果不存在且权限允许，会自动创建） |
| `model` | string | 否 | Kimi 模型别名（`provider/model`）。默认值为 `kimi-code/kimi-for-coding`。留空时 Kimi 使用自身 `config.toml` 中的 `default_model`。 |
| `promptTemplate` | string | 否 | 所有运行使用的提示词模板 |
| `instructionsFilePath` | string | 否 | 添加到提示词开头的 Markdown 指令文件。本地运行时，同目录的兄弟文件（`HEARTBEAT.md`、`SOUL.md`、`TOOLS.md`）会通过 `--add-dir` 设为可读。 |
| `effort` | string | 否 | 思考力度（`low` \| `medium` \| `high` \| `max`）。**仅适用于 CLI 通道：**对于支持思考力度的模型（当前为 `kimi-code/k3`），会将其作为 `KIMI_MODEL_THINKING_EFFORT` 转发；由于 Kimi 没有 medium 档，`medium` 会映射为 `high`。不支持 `support_efforts` 的模型会忽略该字段；默认 ACP 引擎也不会转发该字段。需要控制思考力度时，请固定使用 `engine: cli`。 |
| `command` | string | 否 | CLI 命令覆盖项。默认值为 `kimi`。 |
| `extraArgs` | string[] | 否 | 追加到每次运行的额外 CLI 参数 |
| `env` | object | 否 | 环境变量（支持密钥引用） |
| `timeoutSec` | number | 否 | 进程超时时间（0 表示不超时） |
| `graceSec` | number | 否 | 强制终止前的宽限时间 |

<a id="execution-engine"></a>

## 执行引擎

默认情况下，adapter 通过 **ACP 引擎**（`kimi acp`，通过 stdio 通信的 Agent Client Protocol 服务器）运行 Kimi；该共享引擎也用于 `claude_local`、`codex_local` 和 `gemini_local`。ACP 会实时流式传输对话记录：assistant 文本以增量形式到达，工具调用会报告 `pending`/`completed` 状态，因此 issue 线程会持续更新，而不是分批显示。

引擎选择方式（`engine` 配置字段）：

- 留空或设为 `auto`：前置条件满足时使用 ACP（Node >= 20、可解析的 `kimi acp` 命令、支持双向通信的进程目标），否则返回可操作的设置错误并使运行失败。
- `acp`：要求使用 ACP；启动失败会作为运行错误显示，不会回退。
- `cli`：固定使用下文介绍的无头 CLI 通道。

ACP 通道复用共享的 acpx 会话编解码器、对话记录解析器和 CLI 事件格式化器，因此会话、对话记录和日志的显示方式与其他 ACP adapter 一致。

<a id="headless-execution-cli-lane"></a>

## 无头执行（CLI 通道）

运行命令为 `kimi -p <prompt> --output-format stream-json`（配置了模型时追加 `-m <model>`，恢复会话时追加 `-r <sessionId>`）。本地运行时，adapter 还会传入 `--add-dir <instructions-dir>`，使 agent 能读取同目录的指令文件；需要技能时传入 `--skills-dir <dir>`（见下文）。提示词作为参数传入，不通过 stdin 输入。Adapter 会设置适合无头运行的环境变量（`CI=1`、`NO_COLOR=1`、`KIMI_CODE_NO_AUTO_UPDATE=1`，且仅当 `TERM` 未设置时设为 `dumb`），避免无人值守的 heartbeat 被交互提示、主题检测或更新预检阻塞；用户配置的环境变量始终优先。

<a id="instructions-bundle"></a>

## 指令包

当 `instructionsFilePath` 指向托管指令包时，入口文件（例如 `AGENTS.md`）会添加到提示词开头，并附带一条指令，列出其同目录文件（`HEARTBEAT.md`、`SOUL.md`、`TOOLS.md`）。本地运行时，包含这些文件的目录会通过 `--add-dir` 提供给 Kimi，因此 agent 可以实际打开这些配套文件，而不只是看到入口文件。

<a id="thinking-effort"></a>

## 思考力度

`effort` 字段**仅适用于无头 CLI 通道**（`engine: cli`）。默认 ACP 引擎目前**不会转发**此字段：Kimi 的 ACP 接口提供了单独的 `thinking` 配置选项，但 Paperclip 尚未接入，因此 ACP 通道的 agent 设置 `effort` 后，Kimi 仍使用自身默认行为。需要控制思考力度时，请固定使用 `engine: cli`。CLI 通道会将 `effort` 作为 `KIMI_MODEL_THINKING_EFFORT` 运行时覆盖项转发，该设置适用于 Kimi provider，包括托管 OAuth 模型。Kimi 没有单次调用的思考力度参数，也没有 `medium` 档，因此 `medium` 会映射为 `high`；`low`、`high` 和 `max` 按原值传递。为避免 provider 拒绝请求，仅向声明支持 `support_efforts` 的模型（当前为 `kimi-code/k3`）发送该设置；更多模型获得支持后，可扩展 adapter 中的 `EFFORT_CAPABLE_MODELS`。

<a id="session-persistence"></a>

## 会话持久化

Adapter 会从末尾的 `session.resume_hint` meta event 中提取 Kimi session ID，并在 heartbeat 之间持久化。下次唤醒时，会使用 `-r <session_id>` 恢复现有对话，使 agent 保留上下文。

恢复会话时会检查 cwd：如果工作目录自上次运行后发生变化，则会改为启动新会话。

如果恢复会话时出现未知或不可恢复的会话错误，adapter 会自动使用新会话重试。

<a id="skills-delivery"></a>

## 技能传递

需要使用的 Paperclip 技能会从每次运行专属目录传入，并通过 `--skills-dir` 加载，确保可靠且隔离，不会写入共享的 `~/.kimi-code/skills` home。远程运行时，技能快照会同步到目标端，`--skills-dir` 指向该隔离副本。Paperclip 从不覆盖 `$KIMI_CODE_HOME/skills`，因此运维人员或其他 agent 安装的技能会保留。仅当至少配置了一个技能时才会传入 `--skills-dir`；未配置技能的 agent 继续使用 Kimi 默认技能发现机制。

### 控制平面技能

`paperclipai agent local-cli <agentRef> -C <companyId>` 会将 Paperclip 控制平面技能安装到 `~/.kimi-code/skills`（遵循 `KIMI_CODE_HOME`），同时也安装到现有的 `~/.codex/skills` 和 `~/.claude/skills` 目标目录。Kimi 每次运行都会自动发现此 home，因此 agent 从第一轮开始即可使用控制平面 API 参考（issue/comment/interaction 路由），无需通过试错重新寻找端点。传入 `--no-install-skills` 可跳过安装。此功能独立于上文的每次运行 `--skills-dir` 传递机制；后者仅适用于显式配置技能的 agent。

<a id="environment-test"></a>

## 环境测试

使用 UI 中的“测试环境”按钮验证 adapter 配置。检查项包括：

- Kimi CLI 已安装且可访问（`kimi --version`）
- 工作目录是绝对路径且可用（如果缺失且允许则自动创建）
- 认证信息是否可用（`$KIMI_CODE_HOME` 下的 OAuth 凭据/配置文件，或 `KIMI_MODEL_NAME` 与 `KIMI_MODEL_API_KEY` 环境变量对）
- 通过实时 hello 探测（`kimi -p "Respond with hello." --output-format stream-json`）验证 CLI 是否就绪

<a id="notes"></a>

## 说明

- 支持两种执行引擎：ACP 引擎（默认，`kimi acp`）和无头 CLI 通道（`engine=cli`）。
- 标准安装中的可用模型别名：`kimi-code/kimi-for-coding`（K2.7 Coding）、`kimi-code/kimi-for-coding-highspeed`（K2.7 Coding Highspeed）、`kimi-code/k3`（K3）。
