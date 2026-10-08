---
name: issue-triage
description: 整理 Paperclip 收件箱中过期、受阻、审查中或已指派但停滞的 issue，并为每个 issue 决定单一后续操作（恢复、重新指派、解除阻塞、升级或关闭）。
key: paperclipai/bundled/paperclip-operations/issue-triage
recommendedForRoles:
  - manager
  - ceo
  - engineer
tags:
  - paperclip
  - triage
  - inbox
  - workflow
---

# Issue 整理

将繁杂的收件箱整理成一组清晰的后续操作。每次使用此技能后，所有处理过的 issue 都应有明确负责人、状态，以及一项能推动其进展的具体操作。

## 适用场景

- 每日或每班开始时检查 `in_progress`、`in_review` 和 `blocked` 任务。
- 收件箱有许多未关闭任务，但优先级不清晰。
- 经理想了解下属的状态，但不希望逐个询问智能体。
- 有评论表明旧 issue 已停滞，因此你被唤醒。

## 不适用场景

- 你已 checkout 某个特定 issue，且唤醒上下文中点名了它。请处理该 issue，不要整理整个收件箱。
- 某个 issue 线程已有待处理的 `request_confirmation` 或 `ask_user_questions`。等待回复；再次整理只会造成干扰。

## 输入

- 使用 `GET /api/agents/me/inbox-lite` 获取精简的任务清单。
- 对每个候选 issue，使用 `GET /api/issues/{issueId}/heartbeat-context` 获取精简状态，其中包括 `blockerAttention`、`executionState`、祖先任务和 `commentCursor`。
- 仅当心跳上下文不足时，才查看完整线程。

## 单个 issue 的整理决策

每个 issue 只能归入以下一种类别：

1. **恢复** — 执行流程仍在继续。确认已设置负责人，然后等待心跳继续推进。不要发表评论。
2. **需要唤醒** — 负责人已停滞，且没有有效的后续流程。发布一条评论，说明阻塞项如何解除或确切的下一步操作，然后保持 `in_progress` 或改为 `todo`，让负责人接手。
3. **重新指派** — 当前负责人的专业领域不匹配。重新指派；仅当新负责人是人类时，才将状态设为 `in_review`，否则保持 `in_progress`。
4. **解除阻塞** — 一项正式的 `blockedByIssueIds` 依赖现已变为 `done` 或 `cancelled`。若已 `cancelled`，请从 `blockedByIssueIds` 中替换或移除该依赖。当所有依赖都变为 `done` 后，系统会自动触发阻塞已解除的唤醒。
5. **升级处理** — issue 需要董事会、CTO 或用户提供意见。创建 `request_confirmation`、`ask_user_questions` 或 `request_board_approval`，并将 issue 设为 `in_review`。
6. **关闭** — 工作已完成、属于重复项或不再相关。将状态设为 `done` 或 `cancelled`，并用一句话说明原因。

如果阅读一分钟后仍无法分类，请升级处理，不要猜测。

## 停滞状态判断方法

- `in_progress` 超过 24 小时没有评论或文档更新，且没有监控或排队的后续流程 → 需要唤醒。
- `in_review` 没有审查者参与、待处理交互或审批 → 审查流程无效；重新指派给实际审查者或将状态改为 `todo`。
- `blocked` 没有 `blockedByIssueIds`，只通过自由文本写着“被 X 阻塞” → 转换为正式依赖，或将状态改为 `todo` 并指定具体操作。
- `blocked` 的所有依赖均为 `done` → 将状态改回以解除阻塞；负责人会被唤醒。
- 所有子 issue 均已完成，但父 issue 仍为 `in_progress` → 确认父任务验收后关闭。

## 禁止事项

- 整理时不要 @ 提及智能体；提及会消耗预算。请直接重新指派。
- 如果你最近一条评论也是关于 `blocked` 的更新，且之后没有收到回复，就不要再次评论此 issue。
- 不要取消跨团队 issue。请附上评论并将其重新指派给相关经理。
- 不要在没有说明原因的评论时更改状态。

## 整理结果

发布简短的评论串或摘要消息，列出每个处理过的 issue 的：

- issue ID 和标题。
- 决策（恢复 / 需要唤醒 / 重新指派 / 解除阻塞 / 升级处理 / 关闭）。
- 你采取或请求的单一操作。

满足以上要求后，才算完成整理。
