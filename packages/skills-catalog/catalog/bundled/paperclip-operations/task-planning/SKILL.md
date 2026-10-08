---
name: task-planning
description: 将 Paperclip issue 或请求整理为结构化实施计划，包含子任务图、阻塞项、负责人和验收标准，并保存为 issue 的 `plan` 文档。
key: paperclipai/bundled/paperclip-operations/task-planning
recommendedForRoles:
  - manager
  - engineer
  - product
tags:
  - paperclip
  - planning
  - issues
  - delegation
---

# 任务规划

制定 Paperclip 执行者能够实际执行的实施计划：明确子 issue、真实阻塞项、指定负责人和清晰的验收标准。避免计划读起来完整，却无法拆解为具体工作的情况。

## 适用场景

- Issue 要求你“规划”“界定范围”“拆解工作”“设计发布方案”“提出工作方案”等。
- 用户希望先查看书面计划，再批准实施。
- 经理需要委派较复杂的工作，但工作结构尚不清楚。
- 你接手了一个无法在一次心跳内完成、需要拆分的 issue。

## 不适用场景

- Issue 只涉及一项小改动，可在同一次心跳中完成。直接完成即可。
- Issue 属于故障调查（“为什么这里出错了”）。先使用诊断技能，找到根本原因后再制定计划。
- 已有 `plan` 文档，且变更很小。更新现有文档，不要重新开始。

## 产出

1. 更新 issue 中键为 `plan` 的文档（Markdown）。
2. 在 issue 中发布简短评论，链接计划文档并说明下一步操作。
3. 计划需要批准时，创建绑定到最新计划版本、类型为 `request_confirmation` 的 issue 线程交互。

计划获批前，不要创建实施子任务。

## 计划结构

以下部分必须按顺序包含：

1. **目标** — 一段话说明工作完成后对用户、操作员或系统产生的变化。
2. **已审阅的上下文** — 列出阅读过的文档、文件和既有 issue，让审查者能发现缺失的输入。
3. **约束和非目标** — 必须满足的条件（兼容性、安全、性能）以及本计划明确不包含的内容。
4. **方案** — 说明所选路径及简要理由。如考虑过其他方案，也应列出并说明为何不采用。
5. **工作拆分** — 按顺序列出子 issue。每个子项都要包含：
   - 使用祈使句形式的标题。
   - 负责人专业领域（工程、QA、设计、安全、DevRel、经理等）。
   - 工作范围和交付成果。
   - 验收标准。
   - 使用阶段字母或子项标题表示阻塞/被阻塞关系。
6. **验收** — 父 issue 的验收标准，以及用户如何判断整个工作已完成。
7. **风险和缓解措施** — 简短列表；没有风险时可省略。
8. **延期事项** — 说明哪些工作有意延后到后续 issue，以及原因。

## 拆分工作的基本原则

- 每个子 issue 对应一个专业领域。如果两个专业领域需要在同一 issue 中协调，应拆分。
- 每个子 issue 只对应一个验收结论。如果审查者可能说“只完成了一半”，就应该拆分。
- 负责人应仅凭子 issue 的标题和说明即可 checkout 并开始工作。审查者不应为了理解子 issue 而重读父计划。
- 按实际阻塞关系排列子项，不要按作者偏好排序。并行子任务应明确写出 `blockers: none`。
- 避免创建没有验收标准的 `polish` 或 `cleanup` 子 issue，这类任务往往无法结项。

## 提交计划

使用 Paperclip API 写入计划文档，然后发布评论：

- 使用 `PUT /api/issues/{issueId}/documents/plan` 写入 Markdown 正文。如果已存在 `plan`，请传入最新的 `baseRevisionId`。
- 使用 `POST /api/issues/{issueId}/comments` 发布简短摘要并链接计划：`/<prefix>/issues/<issue-id>#document-plan`。
- 如需批准，使用 `POST /api/issues/{issueId}/interactions`，并设置 `kind: request_confirmation`、`targetRevisionId` 为新计划版本、`continuationPolicy: wake_assignee`，以及 `idempotencyKey: "confirmation:{issueId}:plan:{revisionId}"`。
- 创建确认请求后，将 issue 设为 `in_review`。保留负责人身份，以便获批后唤醒规划者。

计划获批后，参阅配套技能，将已接受的计划转换为 Paperclip 可执行任务。该技能的主要要求包括：生成精简任务矩阵（任务、负责人、初始状态、阻塞项）；将每项硬依赖编码到 `blockedByIssueIds` 中——仅有父子层级不会阻止执行；并在关闭原规划 issue 前验证所创建的 issue 图。

## 反模式

- 将计划伪装成描述编辑。应使用 `plan` 文档。
- 只写“阶段 A–Z”，却没有拆分各阶段的工作。
- 子项描述写着“参见父任务”——委派时无法据此开展工作。
- 将验收标准写成“代码审查通过”。审查者需要的是行为标准，而非流程标准。
- 在大段文字中隐藏阻塞关系。应明确列出阻塞项。
