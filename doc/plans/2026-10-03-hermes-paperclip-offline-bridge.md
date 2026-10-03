# Hermes Paperclip 离线 Bridge 设计

日期：2026-10-03。状态：可供实现的设计提案；尚未实现、部署或完成服务器验收。

服务器只常驻 Hermes Gateway，Bridge 作为其 Python 插件运行，复用现有进程。每个 Bot Profile 固定绑定一个 Paperclip 公司里的 Agent。会话和用量先写本地 SQLite，再批量写入 Paperclip 同一 PostgreSQL 集群的独立 Bridge schema。Paperclip 按需启动后展示外部会话并导入费用。角色记忆通过带版本和来源的快照提供给 Hermes。

这里的“Paperclip 离线”指应用服务关闭。数据库是否独立在线尚未核验：如果数据库也关闭、只在 Mac 上运行或仅是异步备份，服务器继续写本地队列，不能宣称已经同步到 Paperclip。此方案不要求在 Hermes 服务器上部署完整 Paperclip、Node 服务、Redis 或向量数据库。

## 交付和验收目标

第一版实现必须满足：Paperclip 应用关闭时，Hermes 可以使用最后一个有效角色快照；Bot 对话、工具记录和主模型及辅助调用的用量可持久保存；数据库恢复后自动补传；Paperclip 启动后能在绑定 Agent 下查看全文、来源和费用，重复传输不会重复入账。费用不足以定价时显示未知或估算，不显示成已确认账单。

本次交付是设计文档，不是可安装插件。实现完成后才能执行文末的真实服务器验收。

## 运行结构

```text
Hermes 服务器
  Hermes Gateway
    paperclip_bridge Python 插件
      身份与快照缓存
      全文及用量采集
      bridge.sqlite 持久队列
      单个批量同步 worker
                  │ 私网或验证证书的 TLS
                  ▼
独立 PostgreSQL，与 Paperclip 使用同一集群和数据库
  paperclip_bridge_v1 schema：快照、事件、回执
  Paperclip 原生表：由 Paperclip 服务管理
                  ▲
Paperclip 按需启动
  Bridge 后端服务：导出快照、幂等导入、费用及预算业务
  Bridge UI 插件：Agent 外部会话和同步状态
```

不依赖常驻 HTTP Bridge。同步 worker 属于 Hermes 插件生命周期，空闲时等待事件，只在有积压或刷新快照时连接数据库。备选 sidecar 只在目标 Hermes 版本不能可靠管理后台生命周期时使用。

## 与现有代码的关系

本次只读核对的仓库为 `/Users/jxcz/Agent Workspace/Paperclip`，未修改其既有业务代码。

| 已核对的能力 | 对设计的影响 |
| --- | --- |
| `packages/adapters/hermes/src/gateway/server/execute.ts` 由 Paperclip 请求远端运行并解析 usage/cost | 保留现有适配器；另行收集 Bot 自主对话，避免重复计费 |
| `packages/db/src/schema/agents.ts` 包含身份、配置及预算；没有统一角色记忆内容列 | 记忆需要显式指定来源，不能假设 SELECT agents 就能得到记忆 |
| `server/src/services/costs.ts` 的 createEvent 更新 Agent 和 Company 月消费并调用预算评估 | 导入器复用并改造业务服务，不从 Hermes 直写 cost_events |
| `packages/db/src/schema/cost_events.ts` 使用整数美分，未提供外部事件唯一键 | 增加导入映射、精度规则和重复保护 |
| `packages/plugins/sdk/src/types.ts` 的数据库客户端仅提供受限 query/execute | 纯 UI 插件不能保证跨费用业务的原子导入；需要小型后端服务扩展 |

新 schema 的实际名称在安装时固定并写入部署清单。若采用 Paperclip 插件托管 namespace，使用宿主返回的名称并核验 Hermes DB 角色权限；不能硬编码猜测 namespace。

## 身份绑定

绑定键为 `(paperclip_instance_id, company_id, agent_id, hermes_instance_id, profile_id)`，另设稳定 `binding_id` 和单调递增 `binding_revision`。第一版限制一个 Profile 对应一个固定 Agent，角色由配置决定，不能由用户消息或模型工具参数切换。

每个 Profile 使用独立 Hermes home、缓存和队列命名空间，避免原生记忆文件和会话混用。安装时验证目标 Hermes 版本实际支持的 Profile 配置路径，不通过全局环境变量在并发消息间切换 Profile。

每次事件固化当时的 binding revision；绑定的各 revision 保存不可变的身份历史，不能只覆盖当前映射。重新绑定只影响新会话，不能把旧积压改归新角色。导入时重新核验 Agent 所属公司、Project/Issue 所属公司和权限。绑定撤销后保留旧事件供审计，阻止新执行；Agent 被删除时进入隔离队列，不自动创建或换人。撤销或换绑前已经生成的积压只能按原 revision 的有效生成时间导入；不以“当前 revision 不匹配”一概丢弃历史事件。

聊天用户的 channel/user 标识只用于来源展示，不等于 Paperclip board 或 Agent 权限。一般 Bot 聊天不会自动创建任务、修改任务状态或唤醒其他 Agent。需要挂到任务时，由受限工具显式选择已授权的任务。

## Hermes 插件和采集点

插件独立发布为 `hermes-paperclip-bridge`，目录含 `plugin.yaml`、`__init__.py`、采集器、队列、同步器及诊断命令。安装到对应 Profile 的插件目录，通过 `register(ctx)` 注册文档支持的扩展点，不修改 Hermes 内部库。

官方 Gateway 生命周期 hook 的消息和回复会截断到 500 字，因此只用来触发同步和诊断。完整会话使用 Python plugin hooks 采集，并以 Hermes 持久会话库做补漏。Hermes 官方扩展点参见 [插件开发文档](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins/) 和 [事件 hooks 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks)。

| 扩展点 | 用途 |
| --- | --- |
| `pre_llm_call` | 注入缓存中的角色上下文和相关记忆，记录本轮用户输入 |
| `post_llm_call` | 保存成功轮次的助手回复；不能据此判断失败轮次没有消费 |
| `post_tool_call` | 保存脱敏后的工具调用、结果与耗时 |
| `post_api_request`、`api_request_error` | 记录每次模型请求的用量、模型、provider 和错误状态 |
| `post_auxiliary_call` | 记录压缩、标题等辅助调用，避免遗漏 |
| `on_session_end`、`on_session_reset` | 保存轮次终态和会话关联；不把每轮结束当整段会话关闭 |

这些是当前官方文档中的名称，服务器 Hermes 版本未核验。安装前固定 release/commit 并做能力探测，回调接受 `**kwargs`。缺少关键用量或全文采集点时显示 degraded，不能静默宣称完整支持。插件注册阶段不联网、不迁移数据库、不启线程；后台启动和结束必须通过该版本实际支持的生命周期完成。

Hermes `state.db` 仅通过独立只读连接读取会话、消息和用量，禁止写入，禁止把旧 `sessions.json` 当会话真源。补漏适配器按固定 Hermes 版本实现，容忍 WAL、锁和后台写入延迟。模型拆分用量的参考源码为 [hermes_state_usage.py](https://github.com/NousResearch/hermes-agent/blob/main/hermes_state_usage.py)。

hook 中只完成脱敏和本地持久提交，不访问远端 DB，不调用 LLM。worker 定期复查近期活跃及刚结束的会话；不能只依赖 session:end，也不能只用一次 last_updated 游标，须有重叠窗口和稳定消息 ID 去重。会话压缩、reset 和源端删除通过显式关系或 tombstone 处理，不把压缩后的历史重复追加成新消息。

来源具备稳定 request/message ID 时以其生成自然键；缺失时先在本地创建并持久保存 ID，以同一 ID 重试。单靠内容 hash 不能去重两次相同文本或相同费用。无法关联的补漏记录标记 incomplete，不能猜测对应请求。

## 存储合同

所有表含 company、agent 或 binding 范围，时间为 UTC，协议与 payload 各自带版本。第一版采用下列六组数据；消息、工具、用量和记忆更新共用 append-only event 表。

| 表 | 关键字段及约束 |
| --- | --- |
| `bindings` | binding_id、instance/company/agent/profile、revision、status；只由管理端写 |
| `snapshots` | binding/revision、snapshot_revision、身份、状态、脱敏 instructions、budget、memory manifest、published_at、valid_until、content_hash；完整发布后才切换当前版本 |
| `events` | event_id、producer_id、binding_revision、conversation_id、turn_id、source_id、source_sequence、kind、occurred_at、payload、payload_hash、protocol_version；event_id 唯一，另设类型对应自然键 |
| `receipts` | event_id、consumer、status、attempts、next_retry_at、lease_until、error_code、native_entity_id、applied_at；唯一 event/consumer |
| `conversation_index` | conversation_id、binding、source、title、first/last activity、last complete turn、linked_issue_id、capture_status |
| `usage_projection` | request_id 或明确标记的 session aggregate、模型/provider、主/辅助类型、token counts、精确金额、pricing/billing 状态、accounting_owner、native_cost_id |

Hermes 只获准调用范围绑定的 append、获取快照和查询自身回执函数。服务端按 DB 身份映射 binding，并核验 revision；不能信任 payload 自报的 company。该角色不能创建表、访问 Paperclip 原生表、修改快照或导入回执。管理和导入角色分开。

数据库 append 在事务里校验绑定、协议、大小和唯一键。重复事件 ID 且 hash 相同，返回原提交结果；hash 不同则拒绝并报告冲突。自然键冲突同样比较内容，不能用 ON CONFLICT DO NOTHING 隐藏数据差异。

建议 DB 函数固定 search_path、禁止 PUBLIC 执行；如使用 SECURITY DEFINER，由无登录的最小权限 owner 持有，显式按连接角色授权。凭证用权限为 0600 的部署 secret 文件或服务环境注入；示例、日志和快照不含 DSN、API key、OAuth 或 Bot token。私网连接仍核验 TLS 身份，不开放数据库公网通配访问。

## 同步与恢复

事件状态依次为 `local_durable → remote_durable → applied`，失败分别停在本地待上传或远端待导入。收到远端事务提交回执才标记上传完成；数据库响应丢失时按原 ID 重发。上传成功后保留本地短期副本，按确认状态和保留策略清理。

默认每批最多 100 条或 1 MiB，有新事件时最多等待 2 秒；仅一个同步 worker、一个 DB 连接。失败指数退避并加入抖动，最长 5 分钟。空闲时快照检查默认 60 秒，可按服务器情况调整。这些是设计默认值，不是性能测量结果。

本地 SQLite 使用 WAL 和持久提交，队列默认上限 256 MiB。达到上限时不丢弃未确认事件：暂停绑定 Profile 的新执行，并显示队列满；纯 hook 失败通常会被宿主跳过，因此必须验证运行前的宿主执行门禁。若目标版本缺少可靠门禁，部署不能通过“可靠同步”的验收，需最小 Gateway 集成扩展。

多导入 worker 通过 claim lease 避免并发处理同一事件，lease 过期后可恢复。不能单凭 MAX(sequence) 跳过较早尚未提交的事件：导入依据每条 receipt，按会话的源序号组织展示，缺口明确标注。协议未知、绑定过期、正文冲突和跨公司数据进入可见隔离队列，不永久重试毒事件。

无法消除的边界：模型已经返回结果，但进程在 hook 持久提交前被强制终止，可能丢失该次观测。用 Hermes 已持久数据补漏；上游同样未持久时只能标记 capture incomplete，通过 provider 账单另行核对，不能承诺任意崩溃下零丢失。

## Paperclip 导入和展示

Paperclip 启动并完成原生及 Bridge migration 后，加载导入器。UI 插件为绑定 Agent 提供“外部会话”：全文、工具、轮次状态、费用、来源、捕获完整性和同步时间。会话正文直接读取 Bridge 的规范化数据；不把自由 Bot 对话伪造成 Paperclip heartbeat。已有 Paperclip run 的事件可以关联真实 run，但关联须由可信调度上下文验证。

默认不把每条聊天复制成任务评论。用户需要交接任务时发布有来源链接的摘要或工作产物；这属于独立的显式操作，不由 importer 自动触发。

费用导入要求同一事务完成：锁定 event receipt、检查 accounting_owner、创建确定性映射的 native cost、更新 Agent/Company 消费及预算状态、写 activity log、设置 receipt applied。需要把现有费用服务改为接受事务上下文，并将暂停/取消通知写成可重试的事务 outbox，提交后执行。

所有费用写入路径，包括原有适配器和 API，按一致顺序锁定 company 及 agent 的预算范围后才计算月消费；只锁 Bridge receipt 无法防止别的来源并发覆盖累计值。整数美分残差同样按 binding/窗口串行结算。费用路径迁移完成前 importer 不启用正式入账。

当前费用 API 不具备这个外部幂等合同。不能采用“POST 费用，然后另行标记导入完成”的方案，否则两步间崩溃会重复计费。UI 插件可以单独发布，可靠费用 importer 是后端扩展；两者均在第一版完整交付范围内。

## 费用和预算语义

用量按每次 provider request 保存，覆盖主模型、工具循环、子 Agent 和辅助模型。session 累计值用于对账，不能再次按轮相加；缺 request ID 时使用单独 aggregate 路径，与逐请求路径互斥。不能把 input 与 cached input 重复相加，依 provider 合同归一化并保留原统计口径。

每个执行确定唯一 `accounting_owner`：Bot 自主执行由 bridge 入账；Paperclip 发起并已经由现有适配器计费的运行仅镜像。由调度端登记外部 run/session 与 Paperclip run 的对应关系，经授权通道传递到 Hermes 并读回确认，不能从聊天文字或 session 名称推断。该关联合同需要扩展现有适配器；已存在但无法追溯归属的会话暂停入账，展示待核对，不能两边各报一次。

费用分为 provider_reported、price_estimated、subscription_included、unknown，并另存实际增量 billed spend；估算价格表记录版本和日期，unknown 不等于零成本。订阅包含量的参考价值不计入实际支出。迟到事件按 occurred_at 归属 UTC 预算月份，当前月累计仅统计当前月。

Bridge 金额使用整数微美元并保留精度来源，禁止浮点累计。Paperclip 原生整数美分采用 binding/预算窗口维度的累计舍入差额并保存残差和事件映射，避免每次小额调用四舍五入成零；provider 更正费用以有来源的差额调整处理，不重复添加全部原费用。多币种需要带汇率来源的转换；第一版未配置币种转换时隔离非 USD 入账。

第一版只承诺费用可见和 Paperclip 恢复后的预算评估，不能承诺 Paperclip 关闭时执行全公司的实时硬预算。UI 同时显示已入账消费、已上传待入账金额和未定价用量，并注明快照时间；不能把快照的 spent 加所有历史 usage，造成重复统计。

如果后续要求离线硬限额，增加独立的 Bridge allowance lease：由 Paperclip 在线时分配有限金额和期限，从公司可用预算预留；Bridge 在共享 DB 中原子预留单次执行的最大额度，完成后结算；DB 断开、租约过期或无法界定调用成本时停止新调用。需要真正的模型调用门禁覆盖主/辅助/子 Agent；`pre_api_request` 是 observer，返回值不阻止调用，不能冒充门禁。全公司预算仍要求其他执行来源参与同一预留机制。

## 记忆交换

Paperclip 的角色记忆可能位于工作目录文件、外部 memory provider 或业务文档。第一版由管理端为每个 binding 显式登记允许导出的来源；不批量导出公司文档、不传运行凭证或 adapterConfig 原文。快照包含摘要、必要的近期记录及来源索引，默认最多 64 KiB；大文档只放索引和受控引用。

每个记忆项包含稳定 ID、scope、source、revision、内容 hash、updated_at、verification 和 tombstone。角色指令来自管理端；对话摘要作为低信任的事实候选，不能升级成权限或指令。Hermes 产生的记忆更新先进入 Bridge，Paperclip 展示为有来源的候选记录，确认或通过既定来源适配器处理后才更新原记忆。普通聊天不全量自动写入长期记忆。

Hermes 保留原生 memory provider；Bridge 使用动态上下文注入和受限 recall 工具，不覆盖 MEMORY.md/USER.md，不同时争夺另一个 provider 的全局写入。每轮从本地缓存注入限量的相关记录，默认不超过 2000 tokens；数据库离线仍可读有效缓存。快照内容更新在下一轮通过动态注入生效，不能假设改文件就能改变已运行会话的冻结系统提示。

快照 freshness 和绑定授权期限分开。过期记忆显示 stale；绑定授权超过 valid_until 后不执行新工作。支持 tombstone 撤回及本地清理，撤回不能只靠追加一句“旧内容无效”。原始会话保留策略与长期记忆分开设置，远端删除同步至缓存和备份清理流程。

## 配置与运维界面

以下是 Bridge 自有配置合同示意，不是已经可用的 Hermes YAML 安装格式。实际包装使用目标版本支持的插件 settings。

```yaml
protocol_version: 1
binding_id: "<管理端创建的固定绑定>"
hermes_instance_id: "<安装时生成并持久保存>"
profile_id: "<固定 Profile>"
database_secret_file: "/etc/hermes/paperclip-bridge.env"
queue_path: "<Profile home>/paperclip-bridge/bridge.sqlite"
sync:
  batch_events: 100
  batch_bytes: 1048576
  flush_seconds: 2
  snapshot_refresh_seconds: 60
  queue_limit_mib: 256
memory:
  inject_max_tokens: 2000
budget:
  mode: observe
```

提供受限的 `paperclip_context`、`paperclip_recall`、`paperclip_sync_status` 工具，固定读取当前 binding，不接受任意 SQL、company/agent 切换或路径。identity 和预算记账不依赖模型主动调用工具。

管理诊断显示绑定角色、快照版本/时龄、最旧积压、队列大小、最近上传、已导入/待入账、未定价次数、capture degraded 和最近错误。worker 用结构化脱敏日志，正文不进入一般运行日志。卸载先排空或导出队列、撤销该 DB 角色，再停止插件；不自动删除共享数据库。

## 实现顺序

1. 固定服务器 Hermes 版本和 Profile，核验数据库拓扑；创建隔离测试数据库和绑定，完成迁移、授权函数及只读诊断。
2. 实现 Hermes 插件、SQLite 队列、快照缓存、逐请求采集和版本固定的会话补漏；完成断网及崩溃恢复验证。
3. 实现 Paperclip 事务导入服务、费用精度及 accounting_owner，加入 Agent 外部会话 UI 和同步状态。
4. 真实服务器联合验收后发布插件包及 Paperclip 配套版本；离线硬预算作为单独扩展验收。

## 真实验收矩阵

| 场景 | 必须观察到的结果 |
| --- | --- |
| Paperclip 应用关闭，DB 在线 | 正常 Bot 对话写入远端 Bridge；无需 Paperclip API 或 Node 常驻 |
| DB 断开后完成多轮对话，再恢复 | 缓存记忆可用，本地队列留存，恢复后全文/用量补传一次 |
| 超过 500 字且包含工具调用的对话 | UI 能核对原始全文和工具状态，不能用 hook 摘要代替 |
| 上传提交后人为丢响应、重启 worker | 重发返回相同回执，事件和费用不增加第二份 |
| 费用导入各事务阶段强制中断 | receipt、费用、累计消费和预算状态一起提交或回滚；通知可恢复 |
| 辅助调用、子 Agent、失败/取消轮次 | 消费不遗漏、不重复；不足以观测的部分显式标记 incomplete |
| 原有 gateway adapter 发起运行 | 同一运行只由指定 owner 入账，Bridge 仅镜像 |
| 两个 Profile 和两个公司交错运行 | 角色上下文、消息、费用严格对应；伪造 binding/company 被数据库拒绝 |
| 快照更新、撤回、重新绑定 | 下一轮看到新动态上下文；旧事件保留原归属，撤回缓存被清除 |
| 跨 UTC 月补传及多笔小额消费 | 历史费用属于历史月，原生美分与精确金额按规则对齐 |
| 队列达到上限 | 新执行被可靠门禁停止，未确认事件保持完整 |
| 低性能服务器空闲及峰值 | 测量插件前后 RSS、CPU、同步延迟和 DB 连接；报告真实增量，不以未测数值承诺轻量 |

验收应同时保留 Hermes 原始会话、Bridge SQL 读回、Paperclip UI、原生费用及 Agent/Company 预算读回。单元测试、Plugin Doctor、构建通过或一条 SQL 成功不等于服务器端到端完成。

## 尚待部署时核实的条件

目标服务器 Hermes release/commit、Profile 隔离和调用门禁；真实 Paperclip 主库及独立在线能力；固定 Agent/company 和记忆来源；provider 的实际费用可得性。设计不借用历史数据库拓扑作为当前事实，不复制本机 OAuth 凭证到服务器。
