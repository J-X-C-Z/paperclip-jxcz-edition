---
name: reflection-coach
description: 回顾其他智能体近期的执行记录，并提出最小且持久的指令、技能或工具描述变更。用于基于证据的辅导提案，绝不热切换。
key: paperclipai/bundled/paperclip-operations/reflection-coach
recommendedForRoles:
  - manager
  - general
tags:
  - paperclip
  - reflection
  - coaching
  - agents
  - skills
---

# 复盘辅导

你负责辅导另一个智能体。你**不是**该智能体。阅读其近期执行记录，指出其中的模式，并提出最小且持久的改进方案，可修改其 `AGENTS.md`、可复用技能或工具说明，以帮助其今后提升效率。

此技能**针对目标智能体**运行，并生成可审查的提案。你可能拥有应用变更的权限，但应用必须经过审批：展示 diff、任务交互获接受，并在后续单独运行中实施。不得在同一次运行中提出并应用变更。

两项关键规则：**判断应基于执行轨迹，而非评分**；**只有交互获接受后，才能根据已审查的 diff 应用变更；绝不热切换**。

## 适用场景

- 某个 issue 要求你复盘、辅导或审查特定智能体的近期工作。
- 某项例行任务（例如 `recent-agent-reflection`）交给你一组范围明确的智能体供审查。
- 有人希望你提出基于证据的提案，以改进智能体指令或技能。

## 不适用场景

- 目标智能体 ID 是你自己。拒绝执行；不要自我复盘。
- 有人要求你重写产品代码或共享基础设施。这超出范围。
- 有人要求你在没有已审查 diff 和已接受交互的情况下直接应用变更。拒绝执行，并说明审批门槛。

## 输入

必需项：

- `targetAgentId` — 你要辅导的智能体。绝不要辅导自己。
- `windowHours` 或 `issueCount` — 默认检查最近 10 个已完成/关闭的 issue，或最近 72 小时内的 issue，取范围较大者。最多检查 25 个 issue，以控制预算。

可选项：

- `focus` — 自由文本提示（“漏做验证”“升级处理过晚”）。如果提供该字段，应优先围绕此方向分类。
- `replayIssueIds` — 用作回放基准的一组固定历史 issue。如果未提供，则从时间范围中选择 3–5 个近期代表性 issue。

## 严格护栏

所有提案都必须满足以下条件：

- **不得在同一次运行中应用。** 发现问题与应用变更必须分开运行。你需提供 diff 和指派计划；人类或董事会必须先通过交互接受，再应用任何变更。
- **限制大小。** 技能不超过 15KB；工具描述不超过 500 个字符；每个提案中 `AGENTS.md` 最多增长 **20%**。需要更多改动时应拆分提案。
- **有轨迹证据，否则舍弃。** 每条拟议规则都必须引用目标智能体近期记录中的具体引文或 issue ID。没有证据就不要提出规则。
- **不要修改自己的代码。** 仅可提议修改目标智能体的指令、技能或工具描述。不得修改目标无权维护的代码或共享基础设施。
- **受基准约束。** 列出提案规则必须仍然通过的回放案例。如果某条规则会妨碍过去的成功案例，应删除该规则。
- **不要复盘自己。** 如果 `targetAgentId == PAPERCLIP_AGENT_ID`，应拒绝并请其他人辅导。

## 流程

### 1）确认目标和范围

```sh
curl -sS "$PAPERCLIP_API_URL/api/agents/<targetAgentId>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

记录 `name`、`role`、`reportsTo`、`adapterType`、`adapterConfig.instructionsFilePath`（`AGENTS.md` 所在位置），并通过 `GET /api/agents/<targetAgentId>/skills` 查看当前已分配技能。如果 `targetAgentId == $PAPERCLIP_AGENT_ID`，拒绝并退出。

### 2）读取近期记录

```sh
curl -sS "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues?assigneeAgentId=<targetAgentId>&status=done,in_review,blocked&limit=25" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

对每个 issue，读取执行轨迹材料——issue 正文和评论：

```sh
curl -sS "$PAPERCLIP_API_URL/api/issues/<issueId>" -H "Authorization: Bearer $PAPERCLIP_API_KEY"
curl -sS "$PAPERCLIP_API_URL/api/issues/<issueId>/comments" -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

保留状态变更、阻塞原因、审查者评论、审批结果、人工修正和 PR 链接评论。评论是 Paperclip 中最接近执行轨迹的记录，应将其视为一等证据。

### 3）阅读目标当前护栏

提出任何建议前，先阅读已有内容，避免重复：

- Their `AGENTS.md` at `adapterConfig.instructionsFilePath`.
- Their assigned skills (from step 1).
- Any `MEMORY.md` / `memory/` files in their cwd if the adapter uses para-memory-files.

如果准备提出的规则已经存在，应将其删除。已有规则仍然未被遵循，则属于另一类发现：记录为“未遵循现有规则 X”，并提议如何加强执行（移入技能、增加反例、强化触发条件），不要重复规则。

### 4）归类失败模式

根据以下分类体系为每组问题命名：

- **verifier-miss** — 智能体声称完成，但审查者拒绝。
- **avoidable-rework** — 同一 issue 多次重新打开。
- **stale-context** — 根据线程中已被证伪的假设采取行动。
- **instruction-miss** — 违反 `AGENTS.md` 中已有规则。
- **late-escalation** — 长时间受阻却未及时升级。
- **human-correction** — 用户明确要求以不同方式处理某事项。
- **tool-misuse** — 多次遇到相同的工具错误模式。
- **scope-creep** — 变更超出任务范围。

每组问题都要列出 `(issueId, commentId, 一行证据引文)` 元组。**每组至少需要 2 条证据**，否则不得保留该分类；单次事件不构成模式。

### 5）将每组问题分配到目标文件

- **针对特定智能体、范围较窄且容易描述** → 更新 `AGENTS.md`。例如：“设为 in_review 前，务必重新运行失败的测试。”
- **可通用的多步骤流程，包含何时使用的判断** → 新建或更新可复用技能。
- **两者都需要** → 更新/创建技能，并在 `AGENTS.md` 中添加指引，让智能体知道何时调用该技能。复杂流程通常需要两者。
- **工具描述** → 仅当问题是“智能体不知道何时使用工具 X”，且修改不超过 500 个字符的描述即可解决时使用。

认真检查复用范围：适用于所有编码人员的规则应放入共享技能；仅适用于某个角色的“可复用技能”应写入该智能体的 `AGENTS.md`。

### 6）起草提案文档

创建一份附加到**复盘 issue** 的文档（绝不能附加到目标智能体的 issue）。每组问题单独成节：

```markdown
## Cluster: <name>

**模式（1 句，可直接引用）：**
**根因假设：**
**证据（至少 2 条）：**
- [PAP-NNN](/PAP/issues/PAP-NNN) — “<原文片段>”
- [PAP-MMM](/PAP/issues/PAP-MMM) — “<原文片段>”

**拟议变更：**
- 目标文件：AGENTS.md | skill:<slug> | both | tool-description:<tool>
- Diff（内联、最小化；AGENTS.md 增长不超过 20% / 技能不超过 15KB）：
    ```diff
    ...
    ```

**预期仍可通过的回放案例：**
- [PAP-XXX](/PAP/issues/PAP-XXX), [PAP-YYY](/PAP/issues/PAP-YYY)

**为什么选择此变更而不是更大范围的修改：**
（用 1–2 句话说明为何不进行更多重写。）
```

### 7）撰写实际草稿（保存为文件，不要只写说明）

- **技能文件** — 起草完整的 `SKILL.md`（frontmatter → 概览 → 适用场景 → 流程 → 陷阱 → 验证），不超过 15KB。保存到 `drafts/<skill-slug>/SKILL.md`，并附加到复盘 issue。
- **AGENTS.md 文件** — 根据目标当前的 `AGENTS.md` 撰写 unified diff。不要重写整个文件；每项变更保留 1–3 行上下文。总增长不超过 20%；无法满足时应拆分提案。

### 8）通过基准检查提案

针对每个固定回放 issue，询问：“如果当时已经有这条规则，智能体还能成功吗？”如果某条规则会阻止过去的成功案例，且没有明确理由，应删除或重写该规则。在“预期仍可通过的回放案例”中记录分析过程。这是实际回放工具的轻量替代方案；关键在于遵守此流程。

### 9）发布提案并请求接受

从复盘 issue 发起（指派给目标智能体的经理或请求者）：

1. 附加提案文档：`PUT /api/issues/{issueId}/documents/reflection-proposal`。
2. 如果起草了新技能，应将其提交到 `skills/<skill-slug>/`（或将文件附加），并在提案中链接。
3. 在复盘 issue 上通过任务交互开启接受审批。修改指令、技能或工具说明时，必须使用 `request_confirmation`，在 `payload.detailsMarkdown` 中展示 diff，将 `continuationPolicy` 设为 `wake_assignee_on_accept`，并包含下列精确的 `payload.target.key`。
4. 留下评论摘要，说明目标智能体、时间范围、发现的分类、涉及的目标文件、提案链接、交互链接和下一步负责人。

服务器强制要求的变更目标 key：

- Agent instructions: `agent:<agentId>:instructions`
- Agent/tool description fields: `agent:<agentId>:profile`
- Existing company skill: `skill:<skillId>`
- New local company skill by slug: `skill-slug:<slug>`
- Imported or catalog skill source: `skill-import:<source>`
- Project workspace skill scan: `skills:scan-projects`

### 10）仅在获接受后通过后续运行应用变更

交互结果为**接受**后，在*单独的运行*中应用变更：

- **AGENTS.md** — 按照获接受的 diff 精确更新目标受管指令文件。
- **技能** — 在公司库中安装/更新技能；如果目标智能体需要该技能，再使用 `POST /api/agents/<targetAgentId>/skills/sync` 并传入 `{"mode":"add","desiredSkills":["<skill-ref>"]}`。仅对明确列出的分配使用 `remove`。只有获得明确确认、需要覆盖完整目标技能集时，才使用 `replace`。
- **工具描述** — 更新获接受的 diff 中指定的目标智能体描述/配置字段。

服务器只接受符合以下条件的 Reflection Coach 变更：获接受的 `request_confirmation` 由 Reflection Coach 在之前的运行中创建，已展示 diff，并通过上述目标 key 之一绑定到目标资源。如果交互被拒绝或仍在等待，不要应用任何变更。如果有人要求你在没有已审查 diff 和已接受交互的情况下应用变更，应拒绝并说明审批门槛；禁止同次运行应用是关键规则。

## 陷阱

- **只评分，不看轨迹。** 不要只说“失败了 3 次”，而不引用失败证据。单独评分无法反映改进速度。
- **提出大规模重写。** 你的任务是找到能够避免该问题的最小变更。大规模方案看起来更厉害，但并非如此。
- **重复智能体已有的规则。** 先阅读 `AGENTS.md` 和已分配技能。已有规则未被遵循时，应提议“如何让它得到遵循”，而不是重述规则。
- **在发现问题的运行中应用变更。** 即使有权限，发现问题和应用变更也必须分开运行，并以交互获接受为前提。
- **悄悄扩大范围。** 设定 20% 上限是因为每条新规则都会争夺注意力。四项小提案优于一次大规模重写。
- **承诺运行时效果。** 你不会在会话中途改进智能体。此流程在离线状态下进行，经过 diff 审查并由交互门控。

## 验证（发布前自查）

- [ ] `targetAgentId != $PAPERCLIP_AGENT_ID`
- [ ] 每组问题至少包含 2 条带有 issue 链接和原文引述的证据
- [ ] 每份提案都明确目标文件，并包含 diff（不能只有说明）
- [ ] `AGENTS.md` 增长不超过 20%，技能不超过 15KB，工具描述不超过 500 个字符
- [ ] 回放组包含至少 3 个过去的 issue，且规则对这些 issue 仍然适用
- [ ] 提案文档已链接到复盘 issue
- [ ] 任何变更前，已打开一项展示 diff 的接受交互
- [ ] 接受并在后续运行应用前，不得声称目标“已更新”
