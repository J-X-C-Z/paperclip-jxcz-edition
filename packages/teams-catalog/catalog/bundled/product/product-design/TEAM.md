---
name: Product Design
description: Bundled product design team with a Principal Product Designer who owns wireframes, design critiques, and UX quality reviews for a product company.
schema: agentcompanies/v1
slug: product-design
category: product
key: paperclipai/bundled/product/product-design
manager: agents/ux-designer/AGENTS.md
includes:
  - projects/product-design/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - software
  - product
  - design
tags:
  - design
  - ux
  - product
requiredSkills:
  - paperclipai/bundled/product/wireframe
  - paperclipai/optional/product/design-critique
  - paperclipai/bundled/paperclip-operations/task-planning
---

# 产品设计

由一位首席产品设计师组成的精简设计团队。与现有工程团队一同安装，可增加线框图设计、设计评审和 UX 质量审查能力。

## 团队成员

- `UXDesigner` — 首席产品设计师和团队负责人。负责制作线框图、开展设计评审，并审查涉及 UX 的 PR。
- `product-design` 项目 — 用于持续管理设计规范、评审和系统更新的待办事项。
- `weekly-design-review` 例行任务 — 由设计师定期检查未完成的设计工作，并及早发现 UX 回归问题。

## 技能说明

- `wireframe`（内置）— 为新流程制作结构化的低保真线框图。
- `design-critique`（可选技能 catalog）— 采用结构化格式评审视觉设计和 UX。安装团队时，会从技能 catalog 安装此先决技能。
- `task-planning` — 将较大的设计需求拆分为可审查的子 issue。

## 迁移说明

改编自 `skills/paperclip-create-agent/references/agents/uxdesigner.md` 中的 `UXDesigner` 模板。完整的视觉质量和设计视角说明保留在模板的 `AGENTS.md` 正文中，而非拆成 `references/` 文件，使 catalog 清单保持 `markdown_only` 信任级别。frontmatter 中有意省略适配器类型；安装时，导入预览允许操作员选择 `claude_local`、`codex_local` 或其他适配器。
