# 单体胶囊与状态胶囊

本参考适用于产品 UI、引导流程、组织界面和心跳状态指示器。

## 来源优先级

1. `ui/src/components/AgentCapsule.tsx` - React API, states, sizes, accessibility, gradient wrapping.
2. `ui/src/index.css` - animation timings, reduced-motion behavior, agent gradient token values.
3. `ui/src/lib/status-colors.ts` - heartbeat status color/motion mapping.
4. `ui/src/components/OnboardingWizard.tsx` and `ui/src/pages/DesignGuide.tsx` - accepted usage examples.
5. Website brand guide files under `paperclip-website/src/components/brand/sections/*` - marketing rules and the 12-preset website palette.

## 单个 Agent 胶囊

一个纵向胶囊代表一个 agent。不要将此组件用于装饰或通用状态标签。

状态：

| 状态 | 含义 | 渲染方式 |
| --- | --- | --- |
| `slot` | Empty agent slot | Dashed outline, gentle pulse |
| `configured` | Agent named/model picked, not live | Solid stroke, no fill |
| `online` | Agent online | Gradient liquid rise, then breathing pulse |

Implementation rules:

- 当生命周期表达“这个 agent 正在启动”时，整个流程应复用同一个 DOM 节点。
- 虚线变实线时使用叠层和透明度过渡；CSS 无法对 `border-style` 做动画。
- 在线状态默认使用绿色脉冲。蓝色脉冲仅用于特定引导向导，不是全应用的默认在线状态。
- 产品尺寸为 `sm` 24x60、`md` 34x84、`lg` 46x116。自定义尺寸应保持高度至少为宽度的两倍。
- 胶囊使用完整的药丸形圆角。
- 无障碍标签应说明所代表的 agent 或状态。

动效：

| 动效 | 时长 |
| --- | --- |
| Slot pulse | `1.6s ease-in-out infinite` |
| Liquid rise | `1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards` |
| Online pulse | `1.8s ease-in-out infinite` |
| Layer transition | `opacity 0.5s ease` |

减少动态效果：

- 移除空位脉冲和在线脉冲。
- 移除图层过渡。
- 在线液面直接以完整高度显示，不播放上升动画。

## App Agent 渐变令牌

应用组件当前提供 10 组渐变。`AgentCapsule` 会将超出范围的渐变索引循环映射回 `1..10`。

| 索引 | 顶部令牌 | 顶部颜色 | 底部令牌 | 底部颜色 |
| --- | --- | --- | --- | --- |
| 1 | `--agent-1a` | `#f7cfdc` | `--agent-1b` | `#1f7a3a` |
| 2 | `--agent-2a` | `#c9a9e8` | `--agent-2b` | `#ee79a1` |
| 3 | `--agent-3a` | `#28164b` | `--agent-3b` | `#7a1530` |
| 4 | `--agent-4a` | `#f3e6c4` | `--agent-4b` | `#e3a21a` |
| 5 | `--agent-5a` | `#1f4dd6` | `--agent-5b` | `#3aa35c` |
| 6 | `--agent-6a` | `#e94b27` | `--agent-6b` | `#5a1122` |
| 7 | `--agent-7a` | `#7eb6e3` | `--agent-7b` | `#ee79a1` |
| 8 | `--agent-8a` | `#9ce8a7` | `--agent-8b` | `#bd7ff0` |
| 9 | `--agent-9a` | `#f3b49e` | `--agent-9b` | `#1f4ed4` |
| 10 | `--agent-10a` | `#f2d95f` | `--agent-10b` | `#4fbcba` |

不要把这些当作 Paperclip 通用胶囊调色板。网站品牌指南提供 12 种预设，视频参考另有 12 组渐变，hero 素材库则有 45 组渐变。

## 网站营销胶囊调色板

网站调色板在应用前 10 组渐变的基础上增加了两种预设：

| 索引 | 顶部 | 底部 | 描述 |
| --- | --- | --- | --- |
| 11 | `#C2C2E8` | `#5E3450` | peri -> mauve |
| 12 | `#4DB9B7` | `#3AA35C` | teal -> green |

Marketing capsule rules:

- 胶囊视觉仅用于表示 agent，例如胶囊字段、组织架构节点、状态指示器和头像。
- 不要把胶囊用于界面框架、按钮或通用药丸标签。
- 渐变胶囊使用 `1 : >= 2` 的宽高比例，并采用从上到下的渐变。
- 只有需要纯色标记时才使用单色胶囊。
- 指南中提到语义变量 `--r-capsule`，但当前 `brand.css` 并未导出具体的 `--r-capsule` 变量。核实前不要将其称为现有 CSS 令牌。

## 心跳状态胶囊

心跳状态胶囊是小型实心药丸形标记，与单体渐变胶囊属于不同界面元素。

Status mapping:

| Agent 状态 | 颜色 | 填充色 | 动效 |
| --- | --- | --- | --- |
| `idle` | gray | `#A8AEB2` light, `#6E6960` dark | none |
| `active` | gray | same as idle | none |
| `running` | blue | `#2563EB` | `hb-pulse` |
| `paused` | amber | `#F59E0B` | none |
| `error` | red | `#DC2626` | `hb-blink` |

动效时长：

- `hb-pulse`: `1.6s ease-in-out infinite`
- `hb-blink`: `1.2s step-end infinite`
- 减少动态效果时移除这两种动效。

网站指南中心跳药丸的尺寸为 8x16、圆角半径为 4。品牌页面中的较大展示示例可以使用 14x28。

## 常见错误

- 将胶囊渐变用于通用徽标或按钮。
- 需要小型状态胶囊时却使用完整的渐变 agent 胶囊。
- 把引导流程中的蓝色光效当作默认在线状态。
- 将应用的 10 组、网站的 12 组、视频的 12 组和 hero 素材库的 45 组渐变混成同一个调色板。
- 为状态或生命周期添加动画，却没有提供减少动态效果时的替代方案。
