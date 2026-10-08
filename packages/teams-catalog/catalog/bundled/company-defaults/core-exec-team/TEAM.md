---
name: Core Exec Team
description: Default leadership and engineering team for bootstrapping a Paperclip company with a CEO, CTO, QA Engineer, starter project, and a recurring CEO heartbeat review task.
schema: agentcompanies/v1
slug: core-exec-team
category: company-defaults
key: paperclipai/bundled/company-defaults/core-exec-team
manager: agents/ceo/AGENTS.md
includes:
  - agents/cto/AGENTS.md
  - agents/qa/AGENTS.md
  - projects/first-project/PROJECT.md
defaultInstall: true
recommendedForCompanyTypes:
  - startup
  - software
  - generalist
tags:
  - default
  - executive
  - engineering
  - qa
requiredSkills:
  - paperclipai/bundled/paperclip-operations/task-planning
  - paperclipai/bundled/paperclip-operations/issue-triage
  - paperclipai/bundled/software-development/github-pr-workflow
  - paperclipai/bundled/quality/qa-acceptance
---

# 核心管理团队

核心管理团队是新建 Paperclip 公司的默认内置团队。它由最精简的组织构成，可接收董事会指示、制定计划、实施并验证结果。

## 团队成员

- `CEO` — 负责战略、优先级和委派。使用 `task-planning` 与 `issue-triage` 推进收件箱中的工作。
- `CTO` — 负责技术执行和工程监督，向 CEO 汇报。使用 `github-pr-workflow` 进行代码审查并保持合并流程规范。
- `QA` — 负责验证修复并收集证据，向 CTO 汇报。使用 `qa-acceptance` 编写结构化验收报告。
- `first-project` — CTO 负责的起步项目，用于将公司目标转化为首个实施任务。
- `first-heartbeat` — CEO 的周期性心跳任务，用于检查优先级并确认下一个有价值的任务。

## 迁移说明

此条目与旧版 `server/src/onboarding-assets/ceo/` 模板系列保持一致，同时遵守 catalog 软件包边界。每个智能体的角色文件（旧版的 `SOUL.md`、`HEARTBEAT.md`、`TOOLS.md`）有意合并为单个 `AGENTS.md`，以简化导入和可移植性语义。待引导流程实际切换到 catalog 服务后，可在后续工作中将更完整的角色内容移入 `references/` 文件。
