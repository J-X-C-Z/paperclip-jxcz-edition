---
name: paperclip-capsules
description: 生成、实现或审查 Paperclip 胶囊视觉元素。用于胶囊图、智能体胶囊、心跳状态胶囊、identicon、胶囊阵列或品牌使用规范验证。
key: paperclipai/bundled/product/paperclip-capsules
recommendedForRoles:
  - designer
  - product
  - engineer
  - marketing
tags:
  - paperclip
  - brand
  - capsules
  - agents
  - visual-design
  - hyperframes
---

# Paperclip 胶囊

创建或检查 Paperclip 胶囊视觉元素时，使用此技能。核心规则很简单：**胶囊代表智能体**。胶囊不是通用界面装饰、按钮形状、随意的状态标签或背景图案。

唯一允许的装饰性例外是标准 hero 胶囊阵列。应将它视为特定的 Paperclip 品牌界面，而非任意制作胶囊壁纸的许可。

## 适用场景

- 生成 Paperclip 胶囊图、智能体头像、胶囊群、hero 胶囊阵列或带种子的胶囊 identicon。
- 在产品 UI 中实现单个智能体胶囊。
- 渲染表示智能体状态的心跳状态胶囊。
- 制作使用胶囊图案的 Paperclip 功能视频或营销图片。
- 检查设计是否符合胶囊品牌规范。

## 不适用场景

- 通用圆角标签、徽章、按钮、tag、导航项或装饰图形。
- 非智能体插图中只作为视觉纹理的胶囊。
- 与智能体或心跳状态无关的产品 UI 配色。
- 凭记忆替换应用中现有的 `AgentCapsule` 或状态颜色 helper。

## 不可违背的规则

- **胶囊代表智能体。** 如果界面与智能体无关，就不要添加胶囊。
- **不要在胶囊以外使用智能体胶囊配色。** 绝不要将智能体渐变用于按钮、文本、页面背景、卡片或通用界面装饰。
- **区分不同胶囊系列。** 应用中的单个胶囊、心跳状态胶囊、网站营销胶囊、视频胶囊、带种子的 identicon 和 hero 阵列使用不同数据。
- **Hero 阵列是唯一的装饰性例外。** 遵循标准阵列规范，不要自行制作新的阵列。
- **记录可复现信息。** 对生成的素材，记录 seed、模板、配色、尺寸和来源工作流。
- **遵循减少动态效果的设置。** 所有脉冲、闪烁、呼吸、波浪或填充上升动画都必须提供静态的减少动态效果替代方案。

## 选择正确的胶囊类型

在产品 UI、引导流程、组织界面或头像中，一个胶囊对应一个智能体时，使用**单个智能体胶囊**。实现或修改 UI 行为前，请阅读 `references/individual-status-capsules.md`。

小型实心状态标记应使用**心跳状态胶囊**：空闲/活动为灰色、运行中为蓝色脉冲、暂停为琥珀色、错误为红色闪烁。它们不是高长渐变身份胶囊。

**Hero 胶囊阵列**仅用于品牌主视觉、功能视频主视觉场景或已批准的营销图案。绘制前请阅读 `references/hero-capsule-bank.md`。

任务要求制作混合行、链、网格、图标标记或 hero 构图等胶囊图形时，使用**图形生成器布局**。优先使用支持 seed 和导出的工作流；请阅读 `references/generator-workflows.md`。

智能体需要可复现的个人胶囊标记时，使用**带种子的 identicon/资料标签**。选择变体、配色、抖动算法、密度、光泽、极光、网格、动态效果或导出选项前，请阅读 `references/identicon-prototyper.md`。

## 实施流程

1. 确认你要处理的胶囊系列：单个智能体、状态胶囊、hero 阵列、生成器布局或 identicon。
2. 从此技能中加载匹配的参考文件。
3. 优先使用现有源码实现：
   - 产品 UI：`ui/src/components/AgentCapsule.tsx`、`ui/src/index.css` 和 `ui/src/lib/status-colors.ts`。
   - Hero 阵列：使用 `references/hero-capsule-bank.md` 中的标准规范。
   - 视频工作：若有可用的 Paperclip feature-video HyperFrames 技能，请与此技能配合使用。
4. 生成素材时，选择可复现的工作流，并记录 seed/config。
5. 确认结果仍然体现智能体属性。如果胶囊变成了装饰图案，请将其移除。
6. 执行 issue 任务时，附加或以其他方式提供生成的交付成果，并说明使用的确切工作流。

## 输出要求

生成任何胶囊素材时，都要注明：

- 胶囊系列：`individual-agent`、`heartbeat-status`、`hero-bank`、`graphic-generator` 或 `identicon`。
- 来源工作流或实现路径。
- 可用时提供 seed 和 config。
- 尺寸、格式和渲染器。
- 与 Paperclip 标准渲染方式的任何差异。

代码变更应包含针对已修改界面的检查。对于视觉素材，尽可能提供屏幕截图或可检查的 SVG/PNG/HTML。

## 验收清单

- 每个胶囊是否代表智能体、智能体状态或标准 hero 阵列例外？
- 渐变是否仅用于胶囊形状？
- 应用、网站、视频、identicon 和 hero 阵列的配色是否各自独立？
- 减少动态效果设置是否会降低或移除动态效果？
- 是否记录来源路径或可复现的 seed/config？
- issue 任务中的生成文件是否已附加或链接，作为可检查的交付成果？

## 参考资料

- `references/individual-status-capsules.md` — 产品应用胶囊、心跳状态胶囊、配色注意事项和减少动态效果规则。
- `references/hero-capsule-bank.md` — 标准 hero 阵列的几何、配色、颗粒、波浪、裁剪和渲染清单。
- `references/generator-workflows.md` — 网站生成器和外部图形生成器工作流。
- `references/identicon-prototyper.md` — 确定性的资料标签变体、配色、抖动算法、密度行为、动态效果、导出/共享控件和推荐组合。
