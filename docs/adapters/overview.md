---
title: 适配器概览
summary: 适配器的作用以及如何将智能体连接到 Paperclip
---

适配器负责连接 Paperclip 编排层和智能体运行时。每种适配器都知道如何调用特定类型的 AI 智能体并收集其结果。

## 适配器的工作方式

心跳触发时，Paperclip 会：

1. 查找智能体的 `adapterType` 和 `adapterConfig`
2. 将执行上下文传给适配器的 `execute()` 函数
3. 由适配器启动或调用智能体运行时
4. 适配器捕获 stdout、解析用量和费用数据，并返回结构化结果

## 内置适配器

| 适配器 | 类型键 | 说明 |
|---------|----------|-------------|
| [Claude Code](/adapters/claude-local) | `claude_local` | 在本机运行 Claude Code CLI；条件满足时使用原生 ACP 引擎 |
| [Codex](/adapters/codex-local) | `codex_local` | 在本机运行 OpenAI Codex CLI；条件满足时使用原生 ACP 引擎 |
| [Gemini CLI](/adapters/gemini-local) | `gemini_local` | 在本机运行 Gemini CLI（实验性功能；适配器包已存在，但尚未加入稳定类型枚举） |
| [Kimi Code CLI](/adapters/kimi-local) | `kimi_local` | 通过 ACP 在本机运行 Kimi Code CLI，并可显式选择无头 `-p` 模式 |
| DeepSeek Harness | `dsh_local` | 通过标准 ACP 运行 DSH 自动化配置 |
| OpenCode | `opencode_local` | 在本机运行 OpenCode CLI（多提供方 `provider/model`） |
| Cursor | `cursor` | 在后台模式运行 Cursor |
| Pi | `pi_local` | 在本机运行内嵌的 Pi 智能体 |
| Hermes | `hermes_local` | 通过 `@paperclipai/hermes-paperclip-adapter` 运行本地 Hermes CLI |
| Hermes Gateway | `hermes_gateway` | 通过 `@paperclipai/hermes-paperclip-adapter/gateway` 调用已运行的 Hermes API 服务器 |
| OpenClaw Gateway | `openclaw_gateway` | 连接到 OpenClaw 网关端点 |
| [Process](/adapters/process) | `process` | 执行任意 shell 命令 |
| [HTTP](/adapters/http) | `http` | 向外部智能体发送 Webhook |

## 沙箱目标中的凭据归属

本地 CLI 适配器可以运行在 Paperclip 主机、SSH 目标或托管沙箱目标上。CLI 启动前，适配器会确定应以哪个凭据目录为准：

| 适配器 | 凭据拓扑 | 托管沙箱目标中优先使用的凭据文件 |
|---------|---------------------|-------------------------------------------------------|
| [`codex_local`](/adapters/codex-local) | Paperclip 管理的 `CODEX_HOME` 由主机持有身份验证 | 主机上的 `auth.json` 会链接到受管理的 `CODEX_HOME` 并上传到沙箱。如果配置了智能体专用的 `OPENAI_API_KEY`，Paperclip 会改为写入 API 密钥形式的 `auth.json`，并优先使用该文件。Codex 使用 Paperclip 上传的 `CODEX_HOME` 运行，因此沙箱镜像内置的登录凭据会被覆盖。 |
| [`claude_local`](/adapters/claude-local) | 受管理的远程 Claude 配置由快照持有身份验证 | 如果配置了 `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN`（智能体或环境变量），则优先使用它，而不是已存储的登录凭据。否则 Paperclip 只会上传经过清理的设置、技能和运行时资源；如果远程受管理配置中没有 Claude 凭据文件，就会从沙箱镜像自己的 `$HOME/.claude` 复制 `.credentials.json` 或 `credentials.json`，因此优先使用镜像中的登录凭据。 |

示例：

- **在 Codex 沙箱中使用主机上的 ChatGPT 登录：**主机的 `~/.codex/auth.json` 会链接到受管理目录，然后作为沙箱的 `CODEX_HOME` 上传。Codex 会读取上传的文件，而不会使用沙箱镜像中已有的 `auth.json`。
- **在 Claude 沙箱中使用镜像内的登录：**Paperclip 会生成远程 `CLAUDE_CONFIG_DIR`，然后从沙箱镜像自己的 `$HOME/.claude` 补充缺少的 `.credentials.json` / `credentials.json`。运行时将使用快照中的 Claude 登录凭据。

### Hermes 本地适配器与网关适配器

如果希望 Paperclip 在每次心跳时都在同一主机上启动本地 `hermes` CLI，请使用 `hermes_local`。如果 Hermes 已作为 HTTP/SSE API 服务器运行，且 Paperclip 应直接调用该服务器而非启动进程，请使用 `hermes_gateway`。这两个类型键都是稳定的内置类型。

统一的 Hermes 包包含这两种内置适配器。旧的
`@paperclipai/adapter-hermes-gateway` 包仅作为弃用的兼容垫片保留一个版本，并重新导出网关入口点。新的插件覆盖项应指向 `@paperclipai/hermes-paperclip-adapter`，并设置所需的类型键（`hermes_local` 或 `hermes_gateway`）。

### 外部（插件）适配器

这些适配器以独立 npm 包的形式发布，并通过插件系统安装：

| 适配器 | 包 | 类型键 | 说明 |
|---------|---------|----------|-------------|
| Droid | `@henkey/droid-paperclip-adapter` | `droid_local` | 在本机运行 Factory Droid |

## 外部适配器

你可以将适配器构建并发布为独立软件包，无需修改 Paperclip 源码。外部适配器会在启动时通过插件系统加载。

```sh
# 通过 API 从 npm 安装
curl -X POST http://localhost:3102/api/adapters \
  -d '{"packageName": "my-paperclip-adapter"}'

# 或从本地目录链接
curl -X POST http://localhost:3102/api/adapters \
  -d '{"localPath": "/home/user/my-adapter"}'
```

完整说明请参阅[外部适配器](/adapters/external-adapters)指南。

## 适配器架构

每个适配器都是一个软件包，其中的模块由三个注册表使用：

```
my-adapter/
  src/
    index.ts            # Shared metadata (type, label, models)
    server/
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui-parser.ts        # Self-contained UI transcript parser (for external adapters)
    cli/
      format-event.ts   # Terminal output for `paperclipai run --watch`
```

| 注册表 | 作用 | 来源 |
|----------|-------------|--------|
| **服务器** | 执行智能体并收集结果 | 软件包根目录中的 `createServerAdapter()` |
| **UI** | 渲染运行记录并提供配置表单 | `ui-parser.js`（动态加载）或静态导入（内置适配器）|
| **CLI** | 格式化实时监视时的终端输出 | 静态导入 |

## 选择适配器

- **需要编程智能体？** 使用 `claude_local`、`codex_local`、`opencode_local`、`hermes_local`，或将 `droid_local` 安装为外部插件。
- **需要最丰富的实时运行反馈？** 如果执行环境满足 ACP 前置条件，可将 `claude_local`、`codex_local` 或 `gemini_local` 的 `adapterConfig.engine` 设为 `acp`，请参阅[反馈粒度](#feedback-granularity)。
- **需要在其他主机上运行 Hermes，或调用已运行的 Hermes 服务？** 使用 `hermes_gateway`。
- **需要运行脚本或命令？** 使用 `process`。
- **需要调用自定义外部服务？** 使用 `http`。
- **需要定制适配器？** [创建自己的适配器](/adapters/creating-an-adapter)或[构建外部适配器插件](/adapters/external-adapters)。

## 反馈粒度

适配器的选择决定了智能体运行期间，运行记录可以实时显示多少结构化细节。每种适配器的 stdout 都会流式写入运行日志并在 UI 中实时呈现；沙箱执行目标上的运行也会增量读取并传送日志。但可见信息的*粒度*取决于适配器发出的事件流。

以下按信息丰富程度从高到低排列：

1. **原生 ACP 引擎（`claude_local`、`codex_local`，或 `engine: "acp"` 的 `gemini_local`）— 完整结构化事件流。** ACP 会为每个有意义的运行时刻发出一条 JSONL 事件：`acpx.session`（智能体、模式、会话标识）、`acpx.status`（进度文本和上下文窗口用量）、`acpx.text_delta`（助手/思考内容的令牌增量）、`acpx.tool_call`（工具标题、调用 ID 和执行过程中的状态更新）、`acpx.result`（停止原因摘要）以及 `acpx.error`（代码、消息、是否可重试）。运行记录会将这些事件呈现为实时更新的消息、思考、工具和状态块；重复的 `acpx.tool_call` 状态更新会合并到同一张工具卡片中，不会重复堆叠。
2. **CLI 包装器（`claude_local`、`codex_local`、`cursor`、`opencode_local` 等）。** 解析各 CLI 自己输出的流式 JSON。你可以看到助手文本、工具调用/结果以及最终用量/费用摘要；具体粒度取决于 CLI 输出的内容——有些会输出工具进度，有些只会输出调用和完成事件。
3. **通用适配器（`process`、`http`）。** 只会提供未结构化的 stdout/stderr 行，运行记录中显示的是原始输出。

**建议：**如果所选执行环境支持，请在 `claude_local`、`codex_local` 或 `gemini_local` 上使用原生 ACP 引擎。丰富的 ACP 状态事件（包括上下文用量）和增量工具调用更新，让你能够最直观地实时查看智能体工作过程。

## UI 解析器约定

外部适配器可以附带独立的 UI 解析器，以告知 Paperclip 网页界面如何呈现其 stdout。若未提供，UI 会使用通用 shell 解析器。详情请参阅 [UI 解析器约定](/adapters/adapter-ui-parser)。

### Cursor 错误详情

Cursor CLI 适配器会优先使用结构化错误输出；若没有，则使用第一条非空诊断行。它会忽略用于提示文件位置的信息性通知 `cursor-retrieval: tracing to ...`。如果 CLI 仅输出这条通知便异常退出，运行记录会显示退出代码。原始 stdout 和 stderr 仍保留在本地运行结果和日志中，供排查问题。环境探测采用相同的诊断信息选择逻辑。这不会改变重试或成功判定。
