# 网格、调色板与字号比例

只能使用以下数值。不要引入新的颜色、尺寸或网格单位。

## 画布预设

| 视口 | 宽 × 高 | 用途 |
| -------- | -------------- | ----------------------------- |
| Desktop  | 1280 × 800     | Default for web app screens   |
| Wide     | 1440 × 900     | Marketing landing pages       |
| Tablet   | 768 × 1024     | iPad-class screens            |
| Mobile   | 375 × 812      | iPhone-class screens          |

始终包含与画布尺寸匹配的 `viewBox="0 0 W H"`，以便嵌入时正确缩放。

## 网格

- 基本单位：**8px**。所有 `x`、`y`、`width`、`height` 值都必须是 8 的倍数。
- 页面外边距：桌面/平板为 **24px**，手机为 **16px**。
- 列间距：桌面为 **24px**，手机为 **16px**。
- 垂直节奏：同级组件之间间隔 **24px**。

### 桌面端 12 列网格

- Total width: 1280
- Outer margin (each side): 48
- Inner content width: 1184
- Column width: 88, gutter 8 → 12 × (88 + 8) − 8 = 1144 + 40 = 1184 ✓

实际使用时，优先对齐常见宽度：
- Sidebar: 240
- Content max: 944 (after sidebar)
- Card grid: 3 × 384 with 24 gutters or 4 × 280 with 24 gutters
- Modal width: 480 (small), 640 (default), 800 (wide)

### 手机单列布局

- Total width: 375
- 两侧外边距各为 16 → 内容区宽 343
- 点击目标：最小高度 44（对齐到 48）

## 调色板（仅允许以下颜色）

| 名称 | Hex | 用途 |
| ---------------- | ---------- | -------------------------------------------------------- |
| Ink              | `#000`     | Strokes, primary text                                    |
| Paper            | `#fff`     | Default fill                                             |
| Mute text        | `#666`     | Placeholder text inside inputs, secondary labels         |
| Placeholder grey | `#e6e6e6`  | Image/avatar/empty-state regions                         |
| Subtle grey      | `#f4f4f4`  | Optional zebra rows in tables; nothing else              |
| Annotation red   | `#d33`     | Annotation layer ONLY — dashed borders, callout numbers  |

调色板仅限这些颜色。不要添加悬停状态、焦点环或品牌色。

## 字号比例

仅使用一种字体：`font-family="-apple-system, system-ui, sans-serif"`。

| 角色 | 大小 | 字重 | 用途 |
| -------- | ---- | ------ | -------------------------------- |
| Caption  | 12   | 400    | Help text, metadata, table footnotes |
| Body     | 14   | 400    | Default text, button labels, list rows |
| Heading  | 20   | 600    | Section headings, card titles    |
| Title    | 28   | 700    | Page title (one per screen)      |

除字号外，只允许通过字重变化。不要使用斜体或下划线（链接除外，见下文）。

### 链接约定

文本链接使用正文 14 号，并设置 `text-decoration="underline"`。不要改变颜色。

### 文本描边

始终为 `<text>` 元素设置 `stroke="none"`。线框 SVG 会在 `<svg>` 根节点为方框设置默认描边；若不覆盖，文本会继承描边并产生多余的光晕。

## 标准组件尺寸

这些尺寸很常见，建议记住。

| 组件 | 尺寸（宽 × 高）|
| ----------------- | ------------ |
| Button (default)  | 120 × 40     |
| Button (small)    | 80 × 32      |
| Button (icon)     | 40 × 40      |
| Text input        | 320 × 40     |
| Text input (full) | 100% × 40    |
| Search input      | 480 × 40     |
| Dropdown          | 200 × 40     |
| Checkbox / radio  | 20 × 20      |
| Avatar (small)    | 32 × 32 circle |
| Avatar (medium)   | 48 × 48 circle |
| Navbar            | 100% × 64    |
| Tab               | (auto) × 48  |
| List row          | 100% × 56    |
| Table row         | 100% × 48    |
| Card padding      | 24 inside    |
| Modal             | 480 / 640 / 800 wide, height auto |

## 坐标约定

- 将每个基本图形放入 `<g transform="translate(x, y)">`，使其内部坐标从 `(0, 0)` 开始。这样便于在不同屏幕间复制粘贴。
- 在每个基本图形上方添加注释，例如 `<!-- 1: nav -->`、`<!-- 2: search -->`，并与 SVG 下方的标注列表对应。
- 将相关基本图形归入带有 `data-region="..."` 属性的父级 `<g>`，方便搜索。

## 留白

留白也是设计的一部分。不要填满画布。如果屏幕意图如此，视口中央只有一张卡片的线框也是有效设计。
