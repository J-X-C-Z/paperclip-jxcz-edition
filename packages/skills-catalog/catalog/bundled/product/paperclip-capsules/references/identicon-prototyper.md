# Identicon 原型生成器

生成或审核可确定性复现的 Paperclip 胶囊标识图/个人资料药丸时，使用本参考。Paperclip content 仓库可用时，原型源文件路径如下：

- `paperclip-content/design/PAP-11825/paperclip-capsule-identicon-prototyper/README.md`
- `paperclip-content/design/PAP-11825/paperclip-capsule-identicon-prototyper/src/identicon.ts`
- `paperclip-content/design/PAP-11825/paperclip-capsule-identicon-prototyper/src/App.tsx`

这些是单个 agent 的标记，不能替代产品 UI 状态胶囊或官方 hero 胶囊素材库。

## 确定性约定

渲染器根据以下参数确定性地产生输出：

```txt
normalized seed + variant + density + theme
```

色彩空间、配色方案、动效和手动角度等其他选项也会影响渲染出的 SVG，复现时同样必须记录。

应用默认状态：

- Seed: `paperclip capsule bank`
- Variant: `gradient-smooth`
- Size control: `48` in the UI; renderer often uses `512` for the primary preview and `256` for samples.
- Density: `56`
- Theme: `charcoal`
- Color space/scheme: `oklch` / `Golden`
- Angle: seeded auto angle unless manually set.
- Motion: on.

几何尺寸：

- SVG viewBox: `0 0 120 292`
- Capsule body: `x=18`, `y=16`, `w=84`, `h=248`, `rx=42`
- Output width is approximately `size * 0.43`; output height is `size`.
- Capsule SVG includes `data-capsule="individual"` and an agent-oriented aria label.

## 变体

渐变变体仅使用平滑色彩，不使用点阵或条纹图案：

| 变体 ID | UI 标签 | 用途 |
| --- | --- | --- |
| `gradient-smooth` | Smooth | Clean two-tone linear gradient. |
| `gradient-soft` | Sheen | Linear gradient plus a soft radial white highlight near the top. |
| `gradient-mesh` | Mesh | Base gradient plus overlapping seeded radial color blobs. |
| `gradient-aurora` | Aurora | Multi-stop diagonal ribbon using three hues plus a broad soft band. |

抖动变体会量化渐变色阶，并为每个色调级别生成一条 SVG 路径：

| 变体 ID | UI 标签 | 算法 |
| --- | --- | --- |
| `dither-floyd` | Floyd | Floyd-Steinberg error diffusion; compact classic grain. |
| `dither-atkinson` | Atkinson | Atkinson error diffusion; crisp Mac-era contrast. |
| `dither-jjn` | JJN | Jarvis-Judice-Ninke wide-kernel diffusion; smoother photographic grain. |
| `dither-bayer4` | Bayer 4 | Ordered dithering with a 4x4 Bayer matrix. |
| `dither-bayer8` | Bayer 8 | Ordered dithering with a recursively built 8x8 Bayer matrix. |
| `dither-bluenoise` | Blue Noise | Hash-based void-and-cluster-style threshold mask; avoids visible grid structure. |

## 色彩系统

支持的色彩空间：

- `hsl`
- `oklch`

HSL 配色方案：

- `Triadic`
- `Complement`
- `Analogous`
- `Mono`
- `Split`
- `Tetrad`

OKLCH 配色方案：

- `Mono`
- `Triadic`
- `Golden`
- `Complement`
- `Analogous`
- `Split`
- `Tetrad`
- `Warm-Cool`
- `Vivid`
- `Pastel`
- `Cinema`
- `Sunset`
- `Earth`

配色方案行为：

- HSL 默认使用 `Triadic`。
- OKLCH 默认使用 `Golden`。
- OKLCH 的 `Pastel` 会降低彩度并提高明度。
- OKLCH 的 `Earth` 使用较低彩度。
- OKLCH 的 `Vivid` 使用较高彩度。
- OKLCH 的 `Cinema`、`Sunset` 和 `Earth` 会有意调整明度/色相，形成更具设计感的外观。
- 手动角度范围为 `0..360`；自动角度由种子决定，通常落在对角方向范围内。

## 密度与抖动行为

UI 密度预设为 `32`、`56` 和 `80`，但渲染器接受数值型密度。

抖动色调级别：

- Density `< 45`: 2 tones
- Density `45..67`: 3 tones
- Density `>= 68`: 4 tones

抖动网格：

- 列数大致按 `size / 8` 计算，并限制在最小 `14`、最大 `34`。
- 行数根据胶囊高度/单元格宽度计算，以保持单元格比例。
- 误差扩散核：
  - Floyd-Steinberg divisor `16`
  - Atkinson divisor `8`
  - Jarvis-Judice-Ninke divisor `48`
- 有序抖动会先按阈值移动目标色阶，再取整到最近的色调级别。

低密度适合更醒目的双色标记，中密度适合清晰易读的个人资料图标，高密度适合表现更丰富的抖动效果。产品状态指示器属于另一类胶囊，不要对其使用抖动算法。

## 推荐组合

原型的实验章节提供了经过验证的组合：

- Smooth gradient + OKLCH `Golden`
- Soft sheen + OKLCH `Sunset`
- Mesh gradient + OKLCH `Vivid`
- Aurora gradient + OKLCH `Cinema`
- Gradient mix + HSL `Triadic`
- Floyd-Steinberg + OKLCH `Golden`
- Atkinson + OKLCH `Sunset`
- JJN + OKLCH `Earth`
- Bayer 4 or Bayer 8 + HSL `Complement`
- Blue noise + OKLCH `Vivid`
- Dither mix + OKLCH `Cinema`

用户要求制作精致的胶囊标记时，优先使用这些组合。只有用户明确要求探索时，才尝试其他方案。

## 主题、动效与随机化

主题：

- `charcoal`: dark brand lab setting with parchment ink.
- `paper`: white/paper setting with black ink.
- `ink`: near-black setting with white ink.

动效：

- 动效会添加细微的垂直 SVG `animateTransform` 平移波浪：在 `4s` 内按 `0 -3; 0 3; 0 -3` 变化并无限循环。
- 静态导出、网格预览和减少动态效果的场景应关闭动效。
- 在原型中按键盘 `Space` 可重播动效。

随机化行为：

- 随机选择风格、色彩空间/配色方案、渐变角度、密度、动效和种子。
- 保持 Size 和 Theme 不变。
- 种子词包括 `atlas`、`budget`、`capsule`、`delta`、`forge`、`governance`、`hermes`、`ledger`、`signal` 和 `thread`。

## 导出与分享

支持的操作：

- Copy SVG
- Download SVG
- Download PNG
- Copy data URI
- Copy React snippet
- Share standalone card URL
- Restore settings from URL hash

URL hash 字段：

- `s`: seed
- `v`: variant id
- `z`: UI size
- `d`: density
- `t`: theme
- `c`: color space
- `p`: color scheme
- `a`: manual angle, omitted for seeded auto angle
- `m`: motion, `1` or `0`

附加标识图素材时，至少记录以下信息：

```md
Capsule identicon

- Seed:
- Variant id:
- Theme:
- Color space / scheme:
- Density:
- Size / output dimensions:
- Motion:
- Angle: seeded auto | <degrees>
- Export: SVG | PNG | data URI | React snippet | card URL
- Source: PAP-11825 identicon prototyper
```

## 冒烟检查

将标识图素材视为完成前，请检查：

- 相同种子和设置会生成相同 SVG。
- 更换种子会改变 SVG。
- 所有选定的变体 ID 都会渲染出非空 SVG。
- SVG 和 PNG 导出文件均非空且可检查。
- 分享链接的 URL hash 能恢复预期的种子、变体、密度、主题、色彩空间、配色方案、角度和动效。
- 静态/减少动态效果的交付形式可以关闭动效。
