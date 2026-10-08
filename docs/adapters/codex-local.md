---
title: Codex
summary: OpenAI Codex 本地适配器的设置与配置
---

`codex_local` adapter 在本地运行 OpenAI Codex CLI。它通过 `previous_response_id` 链实现会话持久化，并通过 Codex 全局技能目录注入技能。

<a id="prerequisites"></a>

## 前置条件

- 已安装 Codex CLI（可以使用 `codex` 命令）
- 主机上的 Codex 登录（`~/.codex/auth.json`），或在 adapter `env` 中为每个 agent 配置 `OPENAI_API_KEY`（对于托管 home，Paperclip 会将其写入 `$CODEX_HOME/auth.json`；Codex CLI 从 `auth.json` 读取凭据，不会直接读取进程环境变量。若使用自行管理的外部 `CODEX_HOME`，请直接在其中写入 `auth.json`）

<a id="configuration-fields"></a>

## 配置字段

| 字段 | 类型 | 必需 | 说明 |
|-------|------|----------|-------------|
| `cwd` | string | 是 | Agent 进程的工作目录（绝对路径；如果不存在且权限允许，会自动创建） |
| `model` | string | 否 | 使用的模型 |
| `engine` | string | 否 | 新建的公司 agent 默认使用 `cli`。显式设置为 `acp` 可启用 ACP。未设置 engine 的现有 agent 继续使用 adapter 级 ACP 默认值。 |
| `promptTemplate` | string | 否 | 所有运行使用的提示词模板 |
| `env` | object | 否 | 环境变量（支持密钥引用） |
| `timeoutSec` | number | 否 | 进程超时时间（0 表示不超时） |
| `graceSec` | number | 否 | 强制终止前的宽限时间 |
| `fastMode` | boolean | 否 | 启用 Codex Fast 模式。目前仅支持 `gpt-5.4`，且会更快消耗额度 |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | 否 | 跳过安全检查（仅用于开发） |

<a id="session-persistence"></a>

## 会话持久化

Codex 使用 `previous_response_id` 保持会话连续性。Adapter 会在 heartbeat 之间序列化并恢复此字段，使 agent 保留对话上下文。

<a id="skills-injection"></a>

## 技能注入

Adapter 会在 Codex 全局技能目录（`~/.codex/skills`）中为 Paperclip 技能建立符号链接，不会覆盖现有用户技能。

<a id="fast-mode"></a>

## Fast 模式

启用 `fastMode` 后，Paperclip 会添加等效于以下内容的 Codex 配置覆盖项：

```sh
-c 'service_tier="fast"' -c 'features.fast_mode=true'
```

目前，Paperclip 仅在所选模型为 `gpt-5.4` 时应用该配置。对于其他模型，该开关会保留在配置中，但执行时会被忽略，以避免运行不受支持的模型。

<a id="managed-codex-home"></a>

<a id="managed-codex_home"></a>

## 托管的 `CODEX_HOME`

当 Paperclip 在托管 worktree 实例中运行（`PAPERCLIP_IN_WORKTREE=true`）时，adapter 会改用 Paperclip 实例下按 worktree 隔离的 `CODEX_HOME`，避免 Codex 技能、会话、日志和其他运行时状态在不同 checkout 之间泄漏。该隔离 home 会从用户主 Codex home 初始化，以保持认证/配置连续性。

<a id="per-agent-isolation-and-auth-seeding"></a>

### Agent 独立隔离与认证初始化

对于 `codex_local` agent，服务器隔离保护会将每个 agent 固定到专属 home（`<instance>/companies/<companyId>/agents/<agentId>/codex-home`），并设置 `OPENAI_API_KEY=""`，确保 agent 不会消耗主机 API key，也不会共享其他 agent 的 Codex 状态。

托管 home 初始为空，因此 adapter 必须在启动 Codex 前向其中配置认证信息；否则 agent 会在没有凭据的情况下运行，provider 会返回 `401 Missing bearer`。初始化约定如下：

- **托管 home**（默认 home，以及公司目录树下配置的任何 `CODEX_HOME`）始终会初始化：从主机 Codex home 为 ChatGPT 订阅版 `auth.json` 创建符号链接；如果配置了 agent 专属 `OPENAI_API_KEY`，则改为写入 API key 对应的 `auth.json`。
- **真正的外部覆盖项**（位于 Paperclip 管理的公司目录树之外的 `CODEX_HOME`）按自行管理处理，永不初始化或覆盖。
- **快速失败保护：**如果托管 home 最终既没有可用的 `auth.json`，也没有配置 API key，则运行会以明确的 `adapter_failed` 错误失败（“未为托管 home 配置 Codex 凭据……”），而不会发送未认证请求。

<a id="auth-ownership-and-precedence"></a>

### 认证归属与优先级

当 Paperclip 管理生效的 `CODEX_HOME` 时，`codex_local` 由主机管理认证。凭据文件按以下优先级确定：

1. **Agent 专属 API key：**如果 adapter 环境中包含非空的 `OPENAI_API_KEY`，Paperclip 会将仅含 `{ "OPENAI_API_KEY": "..." }` 的内容写入 `$CODEX_HOME/auth.json`，覆盖该路径下已有的文件或符号链接。Paperclip 支持的 Codex CLI 版本会从 `auth.json` 读取 key，而不是直接从进程环境读取。
2. **主机上的 ChatGPT 订阅登录：**未配置 agent 专属 key 时，Paperclip 会将共享主机 Codex home 中的 `auth.json` 链接到托管 home。符号链接能继续使用轮换中的/单次有效 refresh token，避免将过期 token 复制到托管 home。
3. **外部 `CODEX_HOME`：**如果 adapter 环境将 `CODEX_HOME` 指向 Paperclip 管理的公司目录树之外，该 home 由用户自行管理。Paperclip 不会初始化或覆盖它，因此使用其中自己的 `auth.json`。

对于沙箱或 SSH 执行，Paperclip 会上传生效的托管 `CODEX_HOME`，并将 Codex 的 `CODEX_HOME` 指向该上传目录。在托管 home 模式下，沙箱镜像中已有的 `auth.json` 会被遮蔽。如果主机没有可用的 `auth.json`，也没有 agent 专属 `OPENAI_API_KEY`，托管运行会快速失败，而不是回退到沙箱内的登录。

示例：worker 在已包含
`$HOME/.codex/auth.json` 的沙箱镜像中运行，且 Paperclip 主机已登录 ChatGPT 订阅。对于托管的 `codex_local` agent，Paperclip 会将主机 `auth.json` 链接到 agent 托管 home，将该 home 上传至沙箱，并把 `CODEX_HOME` 指向上传路径。Codex 读取主机提供的上传文件，因此不会使用沙箱镜像自身的登录信息。

对于高并发沙箱集群，建议使用 agent 专属 `OPENAI_API_KEY`，而不是共享 ChatGPT 订阅登录。API key 模式会为每个托管 home 单独生成 `auth.json`，避免多个并发沙箱共享同一个会轮换的订阅凭据。代价在于计费方式：API key 模式通过 OpenAI API 按 token 计费；ChatGPT 订阅认证则按订阅套餐的固定计划和配额规则使用。应根据集群的成本和并发情况谨慎选择。

<a id="deferred-config-validation-warning-spec"></a>

### 延后实现的配置校验警告规范

本节规定了一项尚未实现的警告。该警告应帮助运维人员在使用 ChatGPT 订阅凭据运行沙箱集群前，注意到主机管理认证的拓扑。

- **来源字段：**解析后的 Codex 认证模式（`api` 或 `subscription`）和
  执行目标类型（`local`、`remote:ssh` 或 `remote:sandbox`）。初始化后根据最终托管 `$CODEX_HOME/auth.json` 的结构推断认证模式：`{ "OPENAI_API_KEY": ... }` 表示 API key 模式；包含订阅 token 的主机认证（包括主机文件符号链接）表示 ChatGPT 订阅模式。只检查顶层结构；不要将凭据值读入警告。目标类型来自 `AdapterExecutionTarget`。
- **转换逻辑：**在运行配置准备或 home 初始化阶段，将“订阅认证模式且执行目标为远程/沙箱”分类为警告条件。这里只进行分类，不要将凭据值读入警告。
- **输出字段：**通过 `onLog("stderr", ...)` 输出警告日志；如果配置校验界面支持，也显示校验警告。输出内容只能包含认证模式标签和目标类型。
- **保留方式：**警告文本可出现在临时运行日志或校验结果中。不要持久化认证材料。
- **攻击者可观察的 ID：**不得新增。警告不能打印 token 值、邮箱地址或 `auth.json` 内容。
- **接入点：**在 `codex_local` 执行/配置准备路径中、托管 home 初始化附近接入检查：`execute.ts` 已可访问 `executionTarget`/目标传输方式，会调用 `seedManagedCodexHome`，并在上传 `CODEX_HOME` 前调用 `evaluateCodexCredentialReadiness`。如果将警告提取到 `codex-home.ts`，应传入解析后的目标分类，不要让 `codex-home.ts` 自行检查执行目标。

由于该警告涉及认证行为，其实现必须在合并前经过维护者安全审查。请将本文档章节视为后续实现规范，不要把它当成可以在仅文档变更中添加警告实现的授权。

<a id="manual-local-cli"></a>

## 手动使用本地 CLI

如需在 heartbeat 运行之外手动使用本地 CLI（例如直接以 `codexcoder` 运行），请使用：

```sh
npx paperclipai agent local-cli codexcoder --company-id <company-id>
```

此命令会安装缺失的技能、创建 agent API key，并打印以该 agent 身份运行所需的 shell exports。

<a id="instructions-resolution"></a>

## 指令解析

配置 `instructionsFilePath` 后，Paperclip 会在每次运行时读取该文件，并将其添加到发送给 `codex exec` 的 stdin 提示词开头。

此功能独立于 Codex 在运行 `cwd` 中执行的工作区级指令发现。Paperclip 不会禁用 Codex 原生仓库指令文件，因此除了 Paperclip 管理的 agent 指令外，Codex 仍可能加载仓库内的 `AGENTS.md`。

<a id="environment-test"></a>

## 环境测试

环境测试会检查：

- Codex CLI 已安装且可访问
- 工作目录是绝对路径且可用（如果缺失且允许则自动创建）
- 认证信号（是否存在 `OPENAI_API_KEY`）
- 通过实时 hello 探测（提示词为 `Respond with hello.`，命令是 `codex exec --json -`）验证 CLI 能否实际运行

<a id="local-subscription-connection-verification"></a>

### 本地订阅连接验证

独立的本地登录流程会通过 Codex app-server 的 `account/rateLimits/read` 接口，并使用 CLI 的认证传输验证隔离的 `CODEX_HOME`。连接不要求仅供浏览器使用的 WHAM 用量请求；该端点的网络过滤或浏览器挑战不得导致原本有效的 Codex 登录验证失败。RPC 错误响应会使验证失败；CLI 探测后会重新读取凭据，以保存可能已轮换的 token。探测使用 `read-only` 沙箱和 `never` 审批设置，不发送 turn 或工具请求，也绝不会回退到运维人员当前环境中的登录凭据。
