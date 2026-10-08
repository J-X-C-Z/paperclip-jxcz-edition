# 生成器工作流

当用户要求生成 Paperclip 胶囊图形、胶囊标识图或可复用视觉素材时，使用本参考。

## 来源优先级

1. Brand authority: app, website brand guide, feature-video references, and hero-bank spec.
2. Deterministic identicon/profile-pill prototype:
   - `paperclip-content/design/PAP-11825/paperclip-capsule-identicon-prototyper/README.md`
   - `src/identicon.ts`
   - `src/App.tsx`
3. Website embedded generator:
   - `paperclip-website/public/brand/generator.js`
   - `paperclip-website/src/components/brand/sections/08-imagery.html`
4. Mirrored graphic-generator contract in this file.

下方镜像的约定取自外部原型的提交 `36a8a092c6ea6aa85bd0862bafb35ff9b9fab852`，但此技能不得依赖该个人仓库仍可访问。本参考中的模式、调色板和控件列表应视为稳定的工作流约定。

## 选择工作流

| 需求 | 首选工作流 |
| --- | --- |
| Canonical hero brand image | Hero capsule bank reference |
| One agent's profile mark | Seeded identicon/profile-pill prototype; read `identicon-prototyper.md` |
| Repeatable marketing motif | External graphic-generator with explicit seed |
| Quick public-doc example | Website embedded generator |
| Product UI state | Existing `AgentCapsule` and status helpers |

## 网站内嵌生成器

模板：

- `blend-row`
- `chain`
- `bar-stack`
- `grid`
- `hero`
- `icon`

调色板：

- `rainbow`
- `warm`
- `cool`
- `mono`
- `signal`
- `duotone`

行为：

- 内部使用带种子的 Mulberry32 伪随机数生成器。
- 支持数量、宽度、高度、抖动、间距和背景参数。
- 适合了解公开品牌指南中的模板和调色板。
- 不太适合 issue 交付物，因为界面没有把种子和配置作为可直接复制的一等控件提供。

## 镜像图形生成器约定

当任务需要生成可复现的胶囊图案，且网站内嵌工具无法满足时使用此约定。我们特意将其镜像到 Paperclip，这样即使原型仓库改名、删除或设为私有，agent 仍可继续工作。

已知模式/模板：

- `blendRow`
- `icon`
- `chainLinks`
- `hero`
- `barStack`
- `grid`
- `wildcard`
- `manualBlend`
- `2d` and `3d` modes

实用控件：

- Explicit numeric seed and reroll controls.
- Anchor palette override panel.
- Dither panel.
- Logo overlay panel.
- Background controls including images.
- PNG and SVG export.

如果实现需要源代码，优先使用 Paperclip 网站内嵌生成器或 Paperclip 自有工具。外部原型链接仅可作为可选历史背景，不能成为任务必需输入。

调色板注意事项：

- `duotones` 调色板与网站的 12 种胶囊预设相匹配。
- vaporwave、cyberpunk、ocean 和 jewel 等实验性调色板只是生成器选项，不是 Paperclip 官方品牌调色板。
- 用户要求严格遵循 Paperclip 品牌规范时，不要使用实验性调色板。

## 确定性标识图 / 个人资料胶囊

为单个 agent 生成可复现的胶囊身份标记时，使用 `identicon-prototyper.md`。该参考包含 PAP-11825 原型中的详细变体 ID、HSL/OKLCH 配色方案、抖动算法、密度/色调行为、动效、分享/导出控件和推荐组合。

## 素材记录模板

为 issue 工作生成素材时，在附件或交付物旁记录以下信息：

```md
Capsule artifact

- Family: identicon | graphic-generator | hero-bank | individual-agent | heartbeat-status
- Workflow: website-generator | external-graphic-generator | identicon-prototype | hand-coded-svg | app-component
- Source path or tool commit:
- Seed:
- Template / variant:
- Palette / theme:
- Color space / color scheme:
- Density / count / dimensions:
- Motion / gradient angle:
- Output: SVG | PNG | HTML | MP4 | WebM
- Divergence from canonical Paperclip rendering:
```

## 审核清单

- 输出是否与 agent 有关，或者属于官方 hero 素材库中的例外？
- 调色板是否适用于所选界面？
- 种子/配置是否足以复现结果？
- 导出内容是否非空且可检查？
- 生成的渐变是否仅用于胶囊形状？
- 如果包含动效，是否提供静态版本或减少动态效果时的替代方案？
