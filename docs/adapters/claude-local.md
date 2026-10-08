---
title: Claude Code
summary: Claude Code 本地适配器的设置与配置
---

`claude_local` adapter 在本地运行 Anthropic Claude Code CLI，支持会话持久化、技能注入和结构化输出解析。

<a id="quota-waits"></a>

## 配额等待

以明确类型的 provider 配额错误结束的 Claude ACP 运行会保留配额分类及解析出的重置时间。恢复操作会等待到该时间；如果没有可用的重置时间，则使用现有的一小时配额退避策略。这也包括 Claude bridge 返回的明确类型兜底错误“Claude 账户没有可用配额”，该错误不含重置时间。
Adapter 会在内存中检查 provider 的最终消息；运行结果和运行日志只保留通用失败消息、恢复标签和重置时间。即使 ACP 将上下文、轮次、速率或配置的预算限制标记为 `limit`，也不会将其视为订阅配额耗尽。

<a id="prerequisites"></a>

## 前置条件

- 已安装 Claude Code CLI（可以使用 `claude` 命令）
- 在 adapter 环境、所选环境或主机环境中配置 `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN`，或者执行目标已登录 Claude Code 订阅账户

<a id="configuration-fields"></a>

## 配置字段

| 字段 | 类型 | 必需 | 说明 |
|-------|------|----------|-------------|
| `cwd` | string | 是 | Agent 进程的工作目录（绝对路径；如果不存在且权限允许，会自动创建） |
| `model` | string | 否 | 使用的 Claude 模型（默认：`claude-opus-5`） |
| `promptTemplate` | string | 否 | 所有运行使用的提示词模板 |
| `env` | object | 否 | 环境变量（支持密钥引用） |
| `timeoutSec` | number | 否 | 进程超时时间（0 表示不超时） |
| `graceSec` | number | 否 | 强制终止前的宽限时间 |
| `maxTurnsPerRun` | number | 否 | 每次 heartbeat 的最大 agent 轮数（默认 `300`） |
| `dangerouslySkipPermissions` | boolean | 否 | 跳过权限提示（默认 `true`）；无交互式审批能力的无头运行必须启用 |

<a id="default-model"></a>

## 默认模型

省略 `model`、将其设为空字符串或只包含空白时，CLI 和 ACP 引擎均使用 Claude Opus 5
（`claude-opus-5`）。此行为同样适用于 model 未设置的现有 agent，包括通过 API 创建的 agent 和在沙箱中运行的 agent。无需数据库迁移。编辑器会显示 Paperclip 默认值，并在你选择模型前保持该设置未设置。

显式设置的 `model` 优先于 `ANTHROPIC_MODEL`。如果只配置了 `ANTHROPIC_MODEL`，adapter 会保留该覆盖值。未显式指定模型的 Bedrock 和 Vertex 配置会继续使用各自 provider 的默认值，因为这些 provider 使用不同的模型 ID。解析模型时，主机环境设置仅适用于本地目标。

该默认值不会更改已显式配置的 agent 模型，也不会更改独立 Paperclip Runner 中带限定信息的 provider profile。

<a id="prompt-templates"></a>

## 提示词模板

模板支持用 `{{variable}}` 替换变量：

| 变量 | 值 |
|----------|-------|
| `{{agentId}}` | Agent's ID |
| `{{companyId}}` | Company ID |
| `{{runId}}` | Current run ID |
| `{{agent.name}}` | Agent's name |
| `{{company.name}}` | Company name |

<a id="session-persistence"></a>

## 会话持久化

Adapter 会在 heartbeat 之间保存 Claude Code 会话 ID。下次唤醒时会继续现有对话，使 agent 保留完整上下文。

恢复会话时会检查 cwd：如果 agent 的工作目录自上次运行后发生变化，则会改为启动新会话。

如果恢复会话时返回未知会话错误，adapter 会自动使用新会话重试。

<a id="poisoned-previous-message-id-recovery"></a>

<a id="poisoned-previous_message_id-recovery"></a>

### `previous_message_id` 损坏（恢复处理）

日志/issue 线程中的症状：

```
API Error: 400 diagnostics.previous_message_id: must be the `id` from a prior /v1/messages response (starts with `msg_`)
```

含义：该会话在磁盘上的 Claude Code transcript JSONL 中包含格式错误的 `previous_message_id`（不以 `msg_` 开头）。Anthropic `/v1/messages` 会对基于该 transcript 的每次恢复请求稳定地返回 400。若没有保护措施，Paperclip 会再次保存同一个损坏的会话 ID，导致 issue 永久卡住——参阅 [RED-976](../../../) / [RED-978](../../../)。

Adapter 会自动执行以下处理：

1. **恢复时自动轮换。**如果 `--resume` 尝试返回此 400，adapter 会使用新会话重试一次，尽力从本地 Claude 配置目录删除损坏的 `<session>.jsonl`，并在后续继续使用新的会话 ID。
2. **先校验再持久化。**携带此 400 的结果不会将其 `session_id` 写回任务会话存储，即使 Claude Code 在结果事件中返回了该字段也一样。Adapter 会返回 `sessionId: null`、`sessionParams: null` 和 `errorCode: "claude_poisoned_previous_message_id"`。
3. **出错时清除会话。**Adapter 会在结果中设置 `clearSession: true`，使 heartbeat 服务删除该 issue 已持久化的会话记录（`clearTaskSessions`）。后续继续运行时会从干净状态开始。

如果在生产环境中遇到此问题，请按以下值班清单处理：

- 在运行记录中确认 `errorCode` 为 `claude_poisoned_previous_message_id`，这表示保护逻辑已正确触发，issue 会在下次 heartbeat 时自动恢复。
- 如果一个 heartbeat 后同一 issue 仍然循环，检查该 `(agentId, taskKey)` 对应的 `agentTaskSessions` 是否已清除。如果没有，说明 adapter 返回值丢失（例如运行结束处理异常）。请升级处理；不要手动编辑记录，并应附上 run ID 创建子 issue。
- 对于远程执行目标（sandbox/SSH），损坏的 JSONL 位于远程端，adapter 只会记录清理意图。新会话重试仍会成功，因为它使用新的会话 ID；无论远程磁盘状态如何，服务器端的 `clearSession: true` 都具有决定性作用。

<a id="skills-injection"></a>

## 技能注入

Adapter 会创建临时目录，并在其中为 Paperclip 技能建立符号链接，再通过 `--add-dir` 传入。这样技能即可被发现，同时不会污染 agent 工作目录。

<a id="remote-credential-ownership"></a>

## 远程凭据归属

未配置 API key 或 `CLAUDE_CODE_OAUTH_TOKEN` 时，`claude_local` 在托管沙箱执行目标上采用由快照持有认证的拓扑。运行使用沙箱执行目标且未显式配置 `CLAUDE_CONFIG_DIR` 时，Paperclip 会在本次运行的 Claude 运行时目录下创建远程 `CLAUDE_CONFIG_DIR`。它会上传经过清理的主机端设置文件，例如 `settings.json` 和 `CLAUDE.md`，但托管初始化内容不会上传主机上的 Claude 凭据文件。

初始化内容复制完成后，远程实体化命令会检查执行目标自身的 `$HOME/.claude` 目录。对于每个缺失的凭据文件，它会从该远程 home 中将 `.credentials.json` 或 `credentials.json` 复制到托管的 `CLAUDE_CONFIG_DIR`。因此，对于托管的远程 Claude 运行，沙箱镜像内置的凭据优先。

示例：沙箱镜像中的 `$HOME/.claude/.credentials.json` 来自其自身的 Claude Code 登录。Paperclip 启动托管远程 `claude_local` 运行时，只上传经过清理的配置初始化内容，并将 `CLAUDE_CONFIG_DIR` 设为远程运行时配置路径。由于托管配置中没有凭据文件，adapter 会在调用 Claude 前，将沙箱镜像的 `$HOME/.claude/.credentials.json` 复制到该路径。本次运行的凭据由沙箱快照持有。

这与 [`codex_local`](/adapters/codex-local) 不同：Paperclip 托管的沙箱运行会上传由主机管理的 `CODEX_HOME/auth.json`，因此沙箱镜像中已有的 Codex 登录会被遮蔽。

如需在 heartbeat 运行之外手动使用本地 CLI（例如直接以 `claudecoder` 运行），请使用：

```sh
npx paperclipai agent local-cli claudecoder --company-id <company-id>
```

此命令会将 Paperclip 技能安装到 `~/.claude/skills`，创建 agent API key，并打印以该 agent 身份运行所需的 shell exports。

<a id="environment-test"></a>

## 环境测试

使用 UI 中的“测试环境”按钮验证 adapter 配置。检查项包括：

- Claude CLI 已安装且可访问
- 工作目录是绝对路径且可用（如果缺失且允许则自动创建）
- API key/认证模式提示（`ANTHROPIC_API_KEY`、`CLAUDE_CODE_OAUTH_TOKEN` 或订阅登录）
- 通过实时 hello 探测（提示词为 `Respond with hello.`，命令是 `claude --print - --output-format stream-json --verbose`）验证 CLI 是否就绪

探测使用与实际运行相同的分层环境变量：选定环境后，会先解析其环境变量（包括密钥引用），再与 adapter 配置中的 `env` 合并，因此测试结果会反映环境级认证配置。缺失的密钥绑定会显示为 `environment_env_binding_missing` 错误，而不会让探测静默通过。
