---
name: Product Engineering
description: Bundled engineering team that pairs a CTO with a senior coder and a QA engineer to deliver, review, and verify product changes.
schema: agentcompanies/v1
slug: product-engineering
category: software-development
key: paperclipai/bundled/software-development/product-engineering
manager: agents/cto/AGENTS.md
includes:
  - agents/senior-coder/AGENTS.md
  - agents/qa/AGENTS.md
  - projects/product-engineering/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - software
  - startup
  - product
tags:
  - engineering
  - delivery
  - qa
  - code-review
requiredSkills:
  - paperclipai/bundled/software-development/github-pr-workflow
  - paperclipai/bundled/quality/qa-acceptance
  - paperclipai/bundled/paperclip-operations/task-planning
  - paperclipai/bundled/docs/doc-maintenance
---

# 产品工程

可选的即装即用工程团队，适用于希望建立完整软件交付流程、但不先安装 catalog 中 `core-exec-team` 的公司。将其安装在现有 CEO/经理之下，导入的 CTO 将负责工程执行。

## 团队成员

- `CTO` — 工程经理和团队负责人。负责审查 PR、制定代码质量标准，并将产品优先级拆解为工程任务。
- `senior-coder` — 主要实施者。负责工程任务、提交 PR，并请求 QA 验证。
- `QA` — 负责验证修复并收集验收证据。
- `product-engineering` 项目 — 此团队持续推进的待办事项。
- `weekly-engineering-sync` 例行任务 — CTO 定期检查并发现阻塞项、确认下一个交付成果。

## 技能说明

- `github-pr-workflow` 统一团队的逻辑提交、分支管理和合并规范。
- `qa-acceptance` 为 QA 提供结构化的通过/失败格式，供编码人员据此采取行动。
- `task-planning` 帮助 CTO 将较大的需求拆分为范围明确的子 issue。
- `doc-maintenance` 使文档与已发布的变更保持一致；如果公司有面向用户的文档，请安装此技能。

## 迁移说明

此条目改编自 `skills/paperclip-create-agent/references/agents/` 中的 `Coder` 和 `QA` 角色模板，以及 `server/src/onboarding-assets/` 下的旧版 CTO 角色设定。frontmatter 中有意不设置适配器默认值（claude_local 或 codex_local），使操作员可以在导入预览中为每个智能体选择适配器。SecurityEngineer 暂不纳入，计划留待未来的 `optional/quality/security-review` 条目，因为大多数公司在初期并不需要专职安全智能体。
