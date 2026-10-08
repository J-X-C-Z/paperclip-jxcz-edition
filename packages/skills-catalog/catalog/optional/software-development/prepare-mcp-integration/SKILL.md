---
name: prepare-mcp-integration
description: >
  通过带引用的研究、内容 PR、针对确切版本的人类审批，以及每个获批连接对应的一份 Paperclip connector PR，准备 MCP/供应商集成。
  用于新集成的研究和交付；不适用于绕过操作手册临时编写 connector 代码。
key: paperclipai/optional/software-development/prepare-mcp-integration
recommendedForRoles:
  - engineer
  - product-manager
  - researcher
tags:
  - mcp
  - integrations
  - connectors
  - research
  - github
  - human-approval
requires:
  - git
  - gh
  - curl
---

# 准备 MCP 集成

将输入链接或供应商简报分为两个独立阶段处理：先在 `paperclip-content` 中创建可审查的研究 PR；只有人类接受确切的研究版本和连接清单后，才在 Paperclip App 中实施 connector。

## 遵守以下边界

- 将 `paperclip-content/integrations/README.md` 视为研究约定，将 `paperclip-content/integrations/skills/integration-harness/SKILL.md` 视为其入口。引用并执行这些文件；不要将它们的 schema、模板、状态机、协调规则或内部门槛复制到此技能中。
- 将实施目标分支中的 `paperclip/doc/connections/CONNECTOR-PLAYBOOK.md` 视为 connector 约定。完整遵循该文档；不要用记忆中的行为或此技能中的示例替代。
- 阶段 A 必须以仅包含研究内容的 PR 结束。研究门槛获批前，不要创建 App 实施分支、任务或代码变更。
- 接受范围必须绑定一个研究 PR 的 head SHA 和明确的连接清单。该接受不适用于之后的 commits 或其他连接。
- 每个获批连接分别创建一份 Paperclip App PR。共享前置基础设施或范围广泛的操作手册修正可使用单独的前置 PR；不要将不同连接合并到同一 connector PR。
- 供应商凭据应存储在获批的密钥存储中。不要将密钥写入简报、catalog 文件、issue 文本、计划、fixture、屏幕截图、日志、分支名、commits 或 PR。

## 默认连接体验

- 默认请求连接可支持的最广泛供应商权限和 scope。操作员在设置时不应被迫预判未来可能需要的每项工具。连接后，通过 Paperclip action catalog、资源边界、ask-first 策略、隔离和审计控制来确保安全使用。
- 默认向导只要求建立有效连接所必需的最少信息：连接身份、身份验证，以及不可避免的租户或资源边界。可选的 scope 缩减、功能组、单项工具筛选、响应模式、传输调优和其他专家控制项，应收纳在一个默认折叠的 **高级**说明中。
- 为高级控制项提供有效且范围较广的默认值，使操作员无需展开它们也能完成设置。如果供应商确实要求明确选择高级选项，应记录此例外并用通俗语言解释，不要默认暴露协议细节。
- 将供应商权限范围和 Paperclip 执行治理视为不同层。不要仅为了弥补缺少的操作审查、审批、隔离或审计策略而缩小请求的供应商权限。

## 预检

1. 加载当前 Paperclip 技能，以了解 checkout、评论、交互、持久状态和最终处置流程。创建任何 PR 前，先加载标准 PR 准备技能（Paperclip 智能体使用 `prepare-paperclip-pr`）。
2. 确认输入 URL、供应商/平台、目标 MCP endpoint 或 API、目标仓库和分支，以及负责该工作的 Paperclip issue。只有无法从简报中安全确定时才询问。
3. 获取两个仓库并记录目标 commit hash。阅读目标 commits 中的规范文件，不要依赖可能过时的工作树。进入阶段 B 前立即再次刷新并重读。
4. 创建任何内容前，检查已有集成 catalog 实体、开放 PR、分支和当前 AppDefinitions/connectors。根据含义匹配，不要只看标题或 slug。
5. 确定输入描述的是一个连接还是多个。一个连接应具有一致的凭据负责人、endpoint/transport、资源边界和可独立审查的 action catalog。尽早记录拟议拆分，并根据证据逐步调整。
6. 优先采用供应商官方文档、协议/RFC 来源、安全的实时探测和当前 Paperclip 代码。第三方来源只用于查找或佐证一手证据。每项事实性陈述都记录 URL 和访问日期；尚未确认的事实应明确标记，不要猜测。

不要仅为研究而修改供应商账户、注册客户端、授予授权或调用写入工具。在不改变供应商状态的前提下，可以执行安全的未认证元数据探测。需要凭据或浏览器的验证，应在必要时明确交给 QA 任务处理。

## 确保运行可恢复

在 Paperclip issue 或 issue 文档中维护一份简明检查点：

- 当前阶段及下一步操作负责人；
- 输入链接和目标仓库 commits；
- 研究 PR URL 和确切的 head SHA；
- 拟议及已接受的连接清单；
- 研究门槛交互和已接受的目标版本；
- 每个连接对应的分支、PR URL/head 和验证摘要；
- 前置/操作手册 PR 和剩余阻塞项。

每次恢复运行时，创建任何内容前先检查此状态与文件、分支、PR、审查和交互记录是否一致。复用含义匹配的现有内容。不要重复创建 catalog 实体、倒退已结束的流程阶段、复用过期接受记录，或意外为同一连接再次开 PR。

## 阶段 A：在 paperclip-content 中研究

1. 从已刷新的内容目标创建隔离 worktree 和分支。保留无关的本地变更。
2. 通过 integration harness 接收提供的链接或简报。让 harness 加载其同级技能，用于发现、功能研究、提案协调、用户故事、UI 规划、实施规划、示例和文档简报。遵守 `integrations/README.md` 中所有内部人工门槛；下方的最终研究门槛不会取代这些门槛。
3. 根据当前流程要求，准备完整且可审查的 OKF/规划材料。对于 MCP 工作，证据应足以决定：
   - 官方 endpoint 和 transport；
   - auth 模式、凭据负责人、scopes、发现机制和 DCR 行为；
   - endpoint 优先级和重定向来源约束；
   - token 有效期、轮换、刷新、撤销和重新认证行为；
   - 工具清单、操作风险、资源筛选、账户/等级/定价限制、管理员设置和验证需求；
   - Paperclip 中确切的服务参与方和系统边界。
4. 每项 Paperclip 界面相关声明都要基于维护中的界面映射和当前 App 代码。创建前先协调信息、更新必需的索引/日志，并按研究约定保留来源链路、时间戳、不可变 slug 和已结束阶段。
5. 向 `paperclip-content` 提交一份仅包含研究的 PR。包含完整规划材料和紧密相关的内容操作手册修正，但不要包含 Paperclip App 实施内容。
6. 执行有针对性的验证和必需的 PR 流程。只有在检查通过、Greptile 达到 5/5、所有可操作的审查意见均已解决，且记录的 PR head 与审查过的 head 仍一致后，才能提出审批。

## 先审批研究，再开始构建

1. 创建或更新专用 issue 文档，列出：
   - 研究 PR URL 和确切 head SHA；
   - 研究使用的 content 和 App 源码 commits；
   - 拟议的连接清单，以及每项连接相互独立的原因；
   - 已知限制、前置条件和待处理问题。
2. 创建一个 `request_confirmation` Paperclip 交互，并将其指向该 issue 文档的最新版本。使用针对该版本的幂等键和 `wake_assignee` continuation policy，使接受或拒绝都能唤醒负责人。请审查者在拒绝时附上版本修改说明。
3. 将 issue 设为 `in_review` 并停止。交互仍待处理时，不要准备 App worktree 或代码。
4. 收到拒绝后，依据交互回复和版本说明，只修改阶段 A 并提交新版本。如果研究 PR head、审批文档或连接清单发生变化，应撤回/替代旧确认并请求新的确认。
5. 获批后，确认回复仍针对最新审批版本和记录的 PR head。只实施已接受的连接。

## 阶段 B：在 Paperclip App 中实施

刷新 App 目标分支，重读当前 Connector Playbook，并在编写代码前记录其 commit。对于每个已接受的连接：

1. 创建一个独立 worktree、分支和 PR。首先与当前 AppDefinitions 和 connector 代码进行协调。
2. 遵循 Connector Playbook 当前关于 catalog entry 或 plugin、复用路径、AppDefinition、transport、凭据 refs、资源筛选、action catalog、治理、向导行为、health/catalog、可用性、撤销、审计和验证的决策。
3. 根据证据确定 OAuth 行为。特别是，除非刻意将 endpoint pair 设为权威来源，否则不要为支持发现机制的 MCP 供应商同时提供完整 authorization/token endpoint pair：当前 broker 优先级可能使该 pair 绕过已存 endpoint、challenge hints 和 RFC 发现。安全探测 DCR 和重定向约束，复用已注册客户端，并在供应商要求时覆盖 token 轮换/终止性刷新失败。
4. 添加当前操作手册要求的连接文档，包括服务参与说明、含确切 auth/discovery/registration/callback endpoints 的时序图，以及分步管理员设置说明。
5. 添加有针对性的自动化测试和类似生产环境的验证钩子，覆盖连接、catalog 发现、允许的读取、ask-first 写入、拒绝/隔离的操作、撤销和审计。适用时还应覆盖 company、actor、resource 和 schema 变更的反例。
6. 仅当实施者无法安全完成真实凭据、供应商授权或浏览器证据时，才创建正式 QA 子 issue。将其设为阻塞依赖，并向 QA 提供确切且不含密钥的步骤和预期证据。
7. 对此 connector PR 执行标准 PR 准备流程。有针对性的验证通过、所有必需检查通过、Greptile 达到 5/5，且所有可操作评论均已解决后，才能提交合并。

逐个独立完成并报告每个连接。一个连接失败或审查延迟，不得导致其他连接被合并到该连接的 PR 中。

## 将新规则反馈到上游

在两个阶段中，都要将新证据与两份规范操作手册对照。

- 将供应商特定事实记录到该供应商的 catalog artifacts、manifest、文档和测试中。
- 证据导致可复用的 schema、门槛、模板、auth 规则、风险策略、文档标准或验证规则发生变化时，更新相应的上游操作手册/技能/模板，并尽可能添加回归测试。
- 在相关研究或 connector PR 中包含范围狭窄且紧密相关的修正。如果修正影响多个 connector、变更共享基础设施或会妨碍单连接审查，则使用单独的前置 PR。
- 修正后，应对依赖工作执行 rebase/协调，并重新进行受影响的规划和验证。如果获批的研究 PR 或连接清单发生变化，则重新执行研究门槛流程。
- 不要明知实施、测试和对应操作手册不一致，却仍将其留在这种状态。

## 完成

将 issue 标记为 done 前，报告确切的研究 PR 和 head、获批的门槛版本、每个 connector/前置 PR 和 head、有针对性的验证结果、CI/审查状态以及上游操作手册变更。仅当存在实际待处理交互/审查者/监控流程时，才将 issue 保持为 `in_review`；仅在明确负责人和具体解除阻塞操作时使用 `blocked`；只有当所有获批连接都已有可合并的 PR，且 issue 无任何必需的后续工作时，才能设为 `done`。
