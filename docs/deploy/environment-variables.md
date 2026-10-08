---
title: 环境变量
summary: 完整环境变量参考
---

Paperclip 用于服务器配置的所有环境变量。

## 服务器配置

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `PORT` | `3100` | 服务器端口 |
| `PAPERCLIP_BIND` | `loopback` | 可访问范围预设：`loopback`、`lan`、`tailnet` 或 `custom` |
| `PAPERCLIP_BIND_HOST` | (未设置) | `PAPERCLIP_BIND=custom` 时必需 |
| `HOST` | `127.0.0.1` | 旧版主机覆盖项；新配置建议使用 `PAPERCLIP_BIND` |
| `DATABASE_URL` | (内嵌) | PostgreSQL 连接字符串 |
| `PAPERCLIP_HOME` | `~/.paperclip` | Paperclip 所有数据的基础目录 |
| `PAPERCLIP_INSTANCE_ID` | `default` | 实例标识符（用于运行多个本地实例） |
| `PAPERCLIP_DEPLOYMENT_MODE` | `local_trusted` | 运行时模式覆盖项 |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `private` | 部署模式为 `authenticated` 时的暴露策略 |
| `PAPERCLIP_API_URL` | (自动推导) | Paperclip API 基础 URL。通过外部方式（例如 Kubernetes ConfigMap、负载均衡器或反向代理）设置时，服务器会保留该值，而不是根据监听主机和端口推导。适用于公网 URL 与本地绑定地址不同的部署。 |
| `PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL` | (board 公网 origin) | 原生 chat provider webhook 的可选 HTTPS origin，适用于 ingress 和 board 使用不同主机的情况。不得包含凭据、路径、查询字符串或片段；配置无效时会拒绝启动。仅用于 provider 回调 URL，不用于 board 链接、身份验证、可信主机或身份确认。 |
| `PAPERCLIP_RUNNER_PUBLIC_URL` | (未设置) | 仅当远程 `paperclip_runner` target 直接连接 Paperclip 时使用的显式 `wss://` 基础 URL。Paperclip 会追加 `/api/runner/v1/connect/<runId>`；反向代理必须为该路由转发 WebSocket upgrade。此值绝不从请求头推导。Daytona 会忽略此值并使用 provider ingress。 |
| `PAPERCLIP_RUNNER_CA_BUNDLE_PATH` | (未设置) | 直连 runner WSS 时可选的 PEM CA bundle。平台根证书仍保持启用，不提供不安全的 TLS 绕过方式。 |
| `PAPERCLIP_RUNNER_REMOTE_BINARY_PATH` | (主机端构建) | 主机本地路径，指向为远程目标 OS 和架构构建的 `paperclip-runnerd` 产物。Paperclip 与远程沙箱不兼容时必需；启动前会验证构建元数据和所需传输模式。 |
| `PAPERCLIP_RUNNER_REMOTE_CODEX_PATH` | (未设置) | 可选的主机本地路径，指向为远程目标 OS 和架构构建的 Codex 可执行文件。对于远程 Codex runner，Paperclip 会将其暂存并在 `paperclip-runnerd` 旁验证。 |
| `PAPERCLIP_RUNNER_REMOTE_CODEX_NPM_SPEC` | (未设置) | 可选的固定 npm package spec（例如 `@openai/codex@0.160.0`）。当沙箱镜像中没有内置 Codex harness 时，会在每个新的远程 lease 中安装。不能与 `PAPERCLIP_RUNNER_REMOTE_CODEX_PATH` 同时设置；Paperclip 会在启动 `runnerd` 前验证已安装的可执行文件。 |
| `PAPERCLIP_RUNNER_REMOTE_PROVIDER_PACK_PATH` | Docker 中为 `/opt/paperclip-runner/provider-pack`；否则未设置 | 主机本地路径，指向由 `pnpm --filter @paperclipai/paperclip-runner build:provider-pack` 构建的不可变 provider pack。已盖章的标准 Docker 镜像内含此 pack；下游组合和 `cloud` target 会继承。未盖章的本地 Docker 构建会跳过 pack 生成。Pack 包含为目标平台构建的 Node 24.11+ 运行时、锁定的生产依赖、OpenCode proxy/可执行文件和 ACPX sidecar。远程 OpenCode 和 ACPX 在缺少该 pack 时 fail closed。只有预装 pack 的完整摘要 manifest 与本次构建生成的 pack 匹配时才会接受，否则 Paperclip 会将本次 pack 暂存到沙箱中。 |
| `PAPERCLIP_HIDDEN_SETTINGS` | (未设置) | 以逗号分隔的设置界面标识，用于在 UI 中隐藏相应区域，并在 API 层限制访问；供代管 Paperclip 的运维人员使用（例如托管云、内部共享服务器）。参阅[隐藏设置界面](#hiding-settings-surfaces)。 |
| `PAPERCLIP_SETTING_DEFAULTS` | (未设置) | JSON 对象，用于替换指定实例设置的 schema 默认值，供托管运维人员使用。参阅[运维设置默认值](#operator-setting-defaults)。 |

`paperclip_runner` 在 Daytona 上的连接使用经过身份验证的 provider WebSocket ingress，并遵循实例实验设置 `enableNativeRunner`（默认 `false`）。无需单独启用 ingress。禁用 Paperclip Runner 会阻止新的原生运行启动，但已持久化的原生运行仍保留恢复路径。为兼容不同版本，已弃用的 `enableRunnerPreviewIngress` key 在已存储和托管配置中仍会被接受，但不影响运行时行为。此设置不影响旧版 adapter 或回调桥接。

### 仅用于 Webhook 的 Chat Ingress

让 `PAPERCLIP_PUBLIC_URL`（或显式设置的身份验证公网 URL）指向实际的 board。如果 board 是私有的，请设置
`PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL=https://chat-ingress.example.com`，并仅从该主机转发 `POST /api/chat-webhooks/*`。provider 签名仍会控制 ingress；该变量不会开放路由或授予 provider 访问权限。绝不要通过公共隧道转发私有的 `local_trusted` board。

在 Paperclip Cloud 中，warm instance 被认领后，chat 回调 URL 和账户关联 URL 会跟随实例签名的规范 origin，无需重启。显式设置的 `PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL` 仍只对 provider 回调优先；board 链接使用已认领的 origin。如果已有 provider 回调配置使用旧 URL，必须更新。

外部消息中的任务链接必须使用可从外部安全访问的 HTTPS board URL。对于本地/私有 board URL，系统会省略链接并提示用户在 Paperclip 中打开任务；绝不会用公共 webhook 主机替代 board 地址。身份确认仍在 board 中完成，因此用户必须能够访问该地址。

### 预装 Runner 的远程镜像

远程沙箱镜像可以预装 `paperclip-runnerd`、`codex` 和位于 `/opt/paperclip-runner/provider-pack` 的 provider pack，避免每个新 lease 都支付上传和 npm 安装成本。将这两个可执行文件名加入沙箱用户的 `PATH`；检查 `PATH` 之前会显式检查 `$HOME/.local/bin`。Paperclip 会先验证 runner 构建元数据、所选 PRP 传输能力、Codex 启动情况、provider pack 摘要、精确 harness 固定版本、Node 兼容性和打包 bridge 摘要，然后才将产物链接到本次运行专属的运行时目录。可执行文件缺失或不兼容时，会回退到 `PAPERCLIP_RUNNER_REMOTE_BINARY_PATH` 和 `PAPERCLIP_RUNNER_REMOTE_CODEX_NPM_SPEC`（或 `PAPERCLIP_RUNNER_REMOTE_CODEX_PATH`），且不改变已选传输方式。OpenCode 和 ACPX 则只回退到 `PAPERCLIP_RUNNER_REMOTE_PROVIDER_PACK_PATH`；远程 target 不会在 Paperclip 主机上启动 provider 进程。Daytona 环境编辑器中的**配置镜像**操作无需单独的容器镜像仓库即可创建此镜像：在设置沙箱中安装可执行文件并完成设置后，Paperclip 会捕获并推广生成的 Daytona 快照，供后续 lease 使用。

<a id="hiding-settings-surfaces"></a>

### 隐藏设置界面

`PAPERCLIP_HIDDEN_SETTINGS` 使用以下注册表中的 key：
`packages/shared/src/settings-visibility.ts`:

- 任意实例设置页：`instance.profile`、`instance.environments`、
  `instance.access`、`instance.experimental`、
  `instance.plugins`、`instance.adapters` ——从导航和路由中移除（General 页面是设置根页面，始终显示）。隐藏 `instance.access`、`instance.plugins` 或 `instance.adapters` 会使其管理端点返回 `403 settings_operator_managed`；隐藏
  `instance.experimental` 会限制所有实验开关写入。
- 任意 Instance → General 分区：`instance.general.censorUsernameInLogs`、
  `instance.general.backupRetention`,
  `instance.general.feedbackDataSharingPreference`（这些字段也会通过 `PATCH /api/instance/settings/general` 拒绝修改值的写入），以及仅影响 UI 的 `instance.general.deploymentStatus` 和 `instance.general.signOut`。
- 任意实验开关：`instance.experimental.<flagKey>`（例如 `instance.experimental.enableSmokeLab`）——对应卡片会消失，修改值的写入会被拒绝。
- 所有当前和未来的实验开关：`instance.experimental.*`。添加 `!instance.experimental.<flagKey>` 条目可保留特定控件。服务器会根据自身功能目录展开此策略，因此新增开关无需修改环境变量也会保持隐藏。Experimental 页面仍可访问。例外仅适用于通配符；无论条目顺序如何，显式隐藏某个开关或限制 `instance.experimental` 页面始终优先。未知例外会记录日志并忽略。
- 任意顶层公司设置页：`company.members`、`company.invites`、
  `company.secrets`、`company.export`、`company.import` ——从设置侧边栏、标签栏和路由中移除（公司 General 页面是设置根页面，始终显示）。这些 key 仅控制 UI 可见性：membership、invite、secret 和 export API 仍可供 agent 和集成使用。`company.import` 是例外——隐藏它也会使所有公司导入路由返回 `403 settings_operator_managed`。在云托管实例上，无论此变量如何设置，导入都会被限制并返回 `403 cloud_managed`。
- Secrets 页中的单个标签页：`company.secrets.vaults`（Provider vaults）和 `company.secrets.proposals`（Proposals）——隐藏对应标签页，但页面其他部分仍显示。这只控制 UI 可见性；secret provider-config 和提案 API 仍可供 agent 和集成使用。

- `workspaces.isolation` 会隐藏项目执行工作区策略、任务和 routine 工作区选择器、pipeline 工作区覆盖项、隔离重发操作，以及执行工作区 Configuration 标签页（包括直接链接）。工作区导航、文件、状态和运行时访问仍可用。此 key 仅控制 UI 可见性：不会禁用隔离、修改已保存策略或阻止 agent 使用相关 API。新任务和 routine 运行会省略已隐藏的草稿覆盖项，以便服务器应用现有默认值。从工作区或父任务启动的任务会保留明确指定的上下文。由运维人员管理时，应单独隐藏两个实验性隔离开关。

未知 key 会被记录到日志并忽略，因此同一份列表可部署到混合版本的应用集群中；已废弃的 key（例如对应页面已删除的 `instance.heartbeats`）也可保留在运维列表中，不会破坏较旧或较新的版本。未设置该变量时不会隐藏任何内容，行为与先前版本相同。隐藏开关不会改变其值；在需要时，应同时设置所需默认值（一般设置请参阅[运维设置默认值](#operator-setting-defaults)）。

例如，以下配置仅保留 Environments 控件，并隐藏 Plugins 设置页：

```sh
PAPERCLIP_HIDDEN_SETTINGS='instance.plugins,instance.experimental.*,!instance.experimental.enableEnvironments'
```

`GET /api/health` 会在 `hiddenSettings` 中返回展开后的具体 key。UI 和设置 API 使用相同限制。读取和回写相同值仍然允许；修改被隐藏的值会返回 `403 settings_operator_managed`。

不支持通配符的旧镜像会忽略通配符和例外项。升级期间应保留显式列出的隐藏开关，或者先升级所有镜像再替换为通配符列表。所有镜像都支持此语法后，仅保留通配符及其例外项即可。没有通配符时，已识别的例外项不会生效。

<a id="operator-setting-defaults"></a>

### 运维设置默认值

`PAPERCLIP_SETTING_DEFAULTS` 接受一个 JSON 对象，其中的字段来自 `packages/shared/src/setting-defaults.ts` 注册表（当前为 `feedbackDataSharingPreference`）。读取时，运维值会替代 schema 默认值：有效值仍等于 schema 默认值的字段会解析为运维值，而用户显式选择的非默认值始终优先。该覆盖不会持久化，因此取消设置该变量后，用户尚未选择的字段会恢复为原始行为。客户端回写读取到的完整设置对象也不会持久化运维值：如果用户尚未选择某字段，将运维值写回该字段会被视为回显覆盖层，该字段仍保持未选择状态。

例如：`PAPERCLIP_SETTING_DEFAULTS='{"feedbackDataSharingPreference":"allowed"}'` 会将 AI 反馈共享默认设为允许；若同时在 `PAPERCLIP_HIDDEN_SETTINGS` 中加入 `instance.general.feedbackDataSharingPreference`，还会隐藏该控件并限制修改值的写入。

未知字段名会被记录到日志并忽略（兼容混合版本集群）。JSON 格式错误，或已知字段值无效时，服务器会拒绝启动——策略配置采用 fail-closed 方式。

## 密钥

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `PAPERCLIP_SECRETS_MASTER_KEY` | (来自文件) | 32 字节加密 key（base64/hex/原始字符串） |
| `PAPERCLIP_SECRETS_MASTER_KEY_FILE` | `~/.paperclip/.../secrets/master.key` | key 文件路径 |
| `PAPERCLIP_SECRETS_STRICT_MODE` | `false` | 敏感环境变量必须使用密钥引用 |

## Agent 运行时（注入 agent 进程）

服务器调用 agent 时会自动设置以下变量：

| 变量 | 说明 |
|----------|-------------|
| `PAPERCLIP_AGENT_ID` | Agent 唯一 ID |
| `PAPERCLIP_COMPANY_ID` | Company ID |
| `PAPERCLIP_API_URL` | Paperclip API 基础 URL（继承服务器级设置；参见上文“服务器配置”） |
| `PAPERCLIP_API_KEY` | 用于 API 身份验证的短期 JWT |
| `PAPERCLIP_RUN_ID` | 当前 heartbeat 运行 ID |
| `PAPERCLIP_TASK_ID` | 触发此次唤醒的 issue |
| `PAPERCLIP_WAKE_REASON` | 唤醒触发原因 |
| `PAPERCLIP_WAKE_COMMENT_ID` | 触发此次唤醒的评论 |
| `PAPERCLIP_APPROVAL_ID` | 已处理的审批 ID |
| `PAPERCLIP_APPROVAL_STATUS` | 审批决定 |
| `PAPERCLIP_LINKED_ISSUE_IDS` | 以逗号分隔的关联 issue ID |

## LLM Provider Key（供 Adapter 使用）

| 变量 | 说明 |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key（供 Claude Code adapter 使用） |
| `OPENAI_API_KEY` | OpenAI API key（供 Codex adapter 使用） |
