---
name: wireframe
description: Produce low-fidelity black-and-white UI wireframes as SVGs or viewer pages. Use when asked to wireframe, sketch a screen, draft a layout, make a low-fi mockup, or publish wireframes.
key: paperclipai/bundled/product/wireframe
recommendedForRoles:
  - designer
  - product
  - engineer
tags:
  - design
  - wireframe
  - ux
  - prototyping
  - svg
---

# 线框图

将低保真黑白 UI 线框图生成为**独立 SVG 文件**。目标是表达**结构**——各元素的位置、顺序和大致尺寸——而不预设颜色、品牌或视觉精修。

## 适用场景

遇到以下表达时触发：

- "wireframe a [screen / page / flow] for X"
- "low-fi / lo-fi mockup of X"
- "draft a layout for X"
- "rough sketch of the [dashboard / settings / login / ...] page"
- "show me how X would lay out before I build it"

如果请求提到品牌、视觉精修、真实组件、“production-ready”、调色板、高保真、Figma 导出或实际代码/HTML/React 交付，则改用 `frontend-design` 等相关技能。

## 统一风格——必须遵守

线框图用于分析结构，不用于装饰。每份输出都必须使用以下令牌：

| 令牌 | 值 | 说明 |
| ---------------- | ------------------------------------------------- | -------------------------------------- |
| Stroke           | `#000` width `1.5`                                | All borders, dividers, outlines        |
| Fill (boxes)     | `#fff`                                            | Default for cards/containers           |
| Placeholder fill | `#e6e6e6`                                         | Image/avatar/empty-state regions       |
| Text colour      | `#000` for labels, `#666` for placeholder text    | No other colours                       |
| Accent           | `#d33` (dashed) — annotation layer ONLY           | Never inside real UI elements          |
| Font             | `font-family="-apple-system, system-ui, sans-serif"` | Single typeface across the whole file  |
| Type scale       | `12` caption · `14` body · `20` heading · `28` title | No other sizes                         |
| Grid             | 8px snap, 24px gutter                             | All x/y/w/h must be multiples of 8     |
| Default canvas   | `1280×800` desktop, `375×812` mobile, `768×1024` tablet | Pick one and state it in the comment   |

如需突出显示某个区域并添加说明，请使用**标注层**（红色虚线）。绝不要给线框图本身上色。

## 工作流

1. **确认范围。** 要设计哪些屏幕？使用哪个视口（桌面/平板/手机）？单屏还是多屏流程？不清楚时先问一个问题，再按最可能的默认情况继续。
2. 从上表中**选择画布**，并在回复中说明视口。
3. **使用基本图形组合。** 阅读 `references/components.md` 并使用其中的片段组装屏幕。所有坐标都对齐到 8px 网格。
4. **将 SVG 写入文件。** 默认路径为工作目录下的 `wireframes/<slug>.svg`。文件名应描述屏幕，例如 `login.svg`、`dashboard.svg`、`settings-account.svg`。
5. 在回复中提供**文本标注列表**，将 SVG 中每个编号区域对应到一行说明（例如“1 — 主导航，2 — 搜索框，3 — 最近项目列表”）。这样纯文本渠道也能访问、检索和审核线框图。
6. **对于多屏流程，**每个屏幕分别生成一个 SVG，再生成汇总用的 `flow.svg`，按从左到右的顺序排列缩略图，并用箭头连接。

## 快速开始——最小 SVG 示例

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"
     font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="#000" stroke-width="1.5">
  <!-- canvas border -->
  <rect x="0" y="0" width="1280" height="800" />

  <!-- example: a button -->
  <g transform="translate(48, 48)">
    <rect width="120" height="40" rx="4" />
    <text x="60" y="25" font-size="14" text-anchor="middle" stroke="none" fill="#000">Continue</text>
  </g>
</svg>
```

统一风格中有两点容易出错：

- 始终为 `<text>` 元素设置 `stroke="none"`（否则文本会继承父级描边，出现光晕）。
- 始终显式设置文本填充色（`fill="#000"`），因为方框的父级组填充色为 `#fff`。

## 基本图形库

可复用的基本图形全集位于 `references/components.md`。若不记得某个基本图形的准确标记，需随时查阅。不要从头重新推导；复制对应片段并调整坐标即可。

提供的基本图形：

- **输入控件：**按钮（实心、描边、图标）、文本输入框、多行文本框、下拉框、复选框、单选框、开关、搜索框
- **布局：**卡片、分区分隔线、侧边栏、双列、三列
- **导航：**顶部导航栏、标签栏、面包屑导航、分页、侧边栏导航
- **内容：**标题、段落块、列表行、表格、键值对、指标卡片
- **媒体：**图片占位符、头像（圆形/方形）、视频占位符
- **浮层：**模态框、抽屉、Toast、工具提示、下拉菜单（展开状态）
- **标注：**编号说明、虚线区域高亮、箭头连接线

## 网格、调色板与字号比例

准确像素值、调色板令牌和字号请参阅 `references/grid-system.md`。

## 完整示例

`references/examples.md` 包含四份可复制并修改的完整线框图：

1. 登录屏幕（手机，375×812）
2. 管理后台（桌面，1280×800）
3. 设置表单页（桌面，1280×800）
4. 模态确认浮层（桌面，1280×800）

用户请求与这些示例相近时，应从示例开始修改，不要从空白画布起步。

## 输出约定

每次提交线框图都应包含：

1. 已写入磁盘的 SVG 文件（明确注明路径）。
2. 在回复中内嵌的 SVG（以便在 Markdown 预览中渲染）。
3. 简短的编号标注列表，说明各区域的用途。
4. 明确说明所作假设（视口、登录状态、空/有数据状态；由于采用单色设计，深色/浅色不适用）。

## 用户要求制作网站/查看页面时

当用户说“做一个展示这些屏幕的页面”“做一个可滚动的单页”“搭建查看器”“让我点击浏览线框图”“把它们都放到一个页面”，或要求将多份线框图打包成可浏览产物（而非生产网站）时触发。

构建**单个静态 `index.html`**，直接加载 SVG 线框图。不要将其改造成 React 应用或组件库；它是审核界面，不是产品 UI。

**文件布局**（默认）：

```
design/<task-slug>/
  index.html
  wireframes/    # the SVGs from this skill
  screenshots/   # any reference screenshots
```

**页面结构**（从 `assets/site-template.html` 开始修改，不要重新编写 CSS）：

- **固定侧边目录**（桌面端宽 240px），列出每个屏幕并提供锚点链接。按 Flow / Screens / Open questions 分组。
- **顶部主视觉标题区**：面包屑（issue ID）、标题、一段摘要和一行元数据标签（`12 screens`、`Lo-fi · monochrome`、`Click any wireframe to zoom`）。
- **每个屏幕一个分区**，采用两列网格：左侧放线框图；右侧放参考图、编号标注和“Why this changes”说明。线框图使用 `<img>` 直接引用 SVG 文件，不要内嵌 SVG 内容。
- **点击缩放灯箱**：用于带有 `[data-zoom]` 标记的元素。按 Esc 或点击背景均可关闭。
- **流程图分区**：放在页面上方附近，加载全宽的 `wireframes/flow.svg`。
- **待解决问题分区**：放在页面底部，列出尚未决定的问题。

**查看器的统一风格**（与线框图本身保持一致）：

- 仅使用以下调色板：`--bg: #fafaf8`、`--panel: #fff`、`--ink: #111`、`--muted: #666`、`--line: #e5e5e0`、`--accent: #d33`（红色虚线仅用于标注）。
- 仅使用系统字体栈：`-apple-system, system-ui, "Segoe UI", sans-serif`。不要使用网络字体。
- 间距基于 8px，卡片使用 `border-radius: 8px`，边框为 1px `--line`；除 `.wire` 悬停时的轻微抬升效果外，不使用阴影。
- 查看器外框可以比线框图稍显精致（轻微悬停效果、圆角卡片），但不得使用彩色。线框图本身必须严格保持单色。

**响应式布局**（报告完成前需验证）：

- ≥980px: two-column grid, sidebar TOC visible.
- 900–980px: grid stacks to one column, TOC still sidebar.
- <900px (tablet/phone): TOC collapses to a sticky `<details>` disclosure at the top of the page, defaults closed; tapping a link auto-closes it. Sections get `scroll-margin-top: 80px` so anchor jumps clear the sticky bar.
- <560px (phone): tighter type/spacing scale, hero shrinks, lightbox switches from flex-centered to block layout at full viewport width with `touch-action: pinch-zoom` so users can pinch in further.

**交付前验证：**在浏览器中打开文件，分别检查 1440×900、768×1024 和 390×844。确认锚点跳转位置正确、灯箱可正常打开/关闭，并且 SVG 宽高比正确。

## 用户要求部署/发布/托管线框图时

遵循 **`here-now` skill** 的流程；发布、匿名/永久站点、认领令牌和凭据均由该技能负责。不要自行实现托管。

加载 `here-now` skill 并按其 `publish.sh` 流程操作，命令形式如下：

```bash
cd design/<task-slug>
{path-to-here-now}/scripts/publish.sh .
# → https://{adjective-noun-suffix}.here.now/
```

如果当前 agent 尚未安装 `here-now`，请安装（`npx skills add heredotnow/skill --skill here-now -g`），或联系负责该 agent 技能集的人员处理。不要自行实现托管。

调用时注意：

- 发布目录应是**根目录直接包含 `index.html` 的目录**，而不是其父目录。发布树的根目录必须有 `index.html`。
- 未保存凭据时，站点为**匿名站点，24 小时后过期**。保存了 API key 后则为永久站点。用户需要永久 URL 时，按 `here-now` skill 的登录码流程操作，不要伪造绕过流程。
- 更新站点时传入 `--slug {existing-slug}`，使 URL 在多轮审核中保持稳定（脚本会自动从 `.herenow/state.json` 加载认领令牌）。
- 从脚本 stderr 中读取 `publish_result.*` 行，以确定 `auth_mode` 和认领 URL；不要读取 `.herenow/state.json` 并将其内容当作事实来源。
- 始终分享本次运行返回的 `siteUrl`；如果是匿名站点，也要提供认领 URL 并说明 24 小时后过期。

## 本技能不适用于

- **生产 UI 代码**——使用 `frontend-design`，或直接编写 React/HTML。
- **高保真或品牌化样稿**——使用 Figma 或设计工具。
- **交互原型**——SVG 是静态的；多屏流程请导出为 flow.svg。
- **系统架构图、时序图或数据模型图**——使用 mermaid 或 plantuml。
- **插画或艺术创作**——使用 `example-skills:canvas-design` 或 `algorithmic-art`。

## 捆绑资源

- `assets/template.svg` — 含隐藏 8px 网格参考线的空白桌面画布；可复制后作为起点。
- `assets/template-mobile.svg` — 375×812 手机画布模板。
- `assets/site-template.html` — 最简审核查看页面（固定目录 + 响应式折叠 + 灯箱）。用户要求制作网站时，将其复制到 `design/<task-slug>/index.html` 并补全各分区。
