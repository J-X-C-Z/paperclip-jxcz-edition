---
name: github-pr-workflow
description: 从功能分支准备 GitHub pull request，包括分支管理、提交组织、标题/正文、验证说明、UI 工作截图和审查意见回复。
key: paperclipai/bundled/software-development/github-pr-workflow
recommendedForRoles:
  - engineer
tags:
  - github
  - pull-requests
  - code-review
  - release
---

# GitHub Pull Request 工作流

提交一份审查者无需追问即可合并的 PR。标题和正文应重点突出，提供变更有效的证据，并清楚回应审查意见。

## 适用场景

- 即将为功能已完成的变更创建 PR。
- 审查者留下了评论，你需要回复并推送修复。
- PR 已打开超过一天，需要重新整理（过期冲突、缺少说明或验证信息）。

## 不适用场景

- 变更尚未完成。先完成工作；因未完成而在审查中被退回的草稿 PR 只会造成干扰。
- 仓库使用的不是 GitHub。请遵循对应代码托管平台的规范，不要强行套用 GitHub 规则。

## 创建 PR 前整理分支

- 从目标基线进行 rebase 或 merge，确保 diff 是最新的。
- 将未完成的 WIP commits 合并为便于审查的单元。优先为每项逻辑变更创建一个 commit；如果工作确实分多步，不要强制要求一个 PR 只包含一个 commit。
- 确认测试、类型检查和 lint 在本地通过。在 PR 正文中说明有意跳过的检查。
- 移除调试输出、注释掉的代码和未跟踪的 `TODO` 标记。

## PR 标题

- 使用祈使句，少于 70 个字符。
- 先说明用户可见的变更，而不是修改了哪个文件。`允许从报告表格导出 CSV` 优于 `更新 reports.tsx`。
- 如果仓库使用 issue 前缀规范（`PAP-1234:`、`[security]`），应遵循该规范。
- 末尾不加句号。

## PR 正文

使用以下结构：

```md
## Summary
- 1–3 bullets describing what changed and why.

## Implementation notes
- Anything non-obvious in the diff: trade-offs, dropped alternatives, gotchas.
- Migration or config implications.

## Verification
- The exact commands or steps you ran.
- Screenshots or short clips for UI changes (required if pixels moved).
- Edge cases you exercised by hand.

## Risk and rollback
- What breaks if this is reverted, and how to revert cleanly.
```

只有对于明确简单的 PR（拼写错误、文档），才可省略 `Risk and rollback` 部分。

## 验证证据

- CI 测试通过是必要条件，但还不够。审查者也需要了解变更是否端到端正常工作。
- UI 工作应包含主流程和一个边缘情况的截图。如果项目支持深色和浅色模式，两种模式都应提供。
- 数据迁移应包含试运行计划和回滚步骤。
- 性能变更应提供前后测量数据，不要只用形容词描述。

## 回复审查意见

- 回复每条评论，即使只回复“已在 <commit-sha> 中修复”也可以；默默修复会让审查者不知所措。
- 审查进行期间，将修复作为新 commit 推送；除非审查者同意，否则不要 amend。
- 如果不同意反馈，用一句话说明理由并让审查者决定。不要因为评论升级冲突。
- 推送变更后，明确重新请求审查。

## 合并清单

- 所有必需检查均已通过。
- 所有审查意见均已处理。
- PR 标题/正文仍准确（审查期间范围改变时应更新）。
- 根据项目规范，将关联 issue 移至 `in_review` 或 `done`。
- 合并后删除分支，除非它是长期集成分支。

## 反模式

- PR 描述只写“参见 commits”。审查者不应被迫阅读提交日志。
- 在同一个 PR 中混合重构和行为变更，却不在正文中分别说明。
- 用“处理反馈”这样的 commit 打包无关编辑。每轮反馈一个 commit 可以接受；将所有进行中的工作塞进一个 commit 则不可接受。
- 审查期间强制推送，却不通知审查者。
