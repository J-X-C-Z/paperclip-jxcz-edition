# Hero 胶囊素材库

Hero 胶囊素材库是“胶囊代表单个 agent”这一规则唯一获准的装饰性例外，也是 Paperclip 官方品牌界面。不要自行设计另一套胶囊素材库。

## 来源优先级

1. `paperclip-content/td/capsules.md` - byte-accurate technical source for geometry, gradients, grain, crop, and wave.
2. Paperclip feature-video HyperFrames skill:
   - `references/capsule-bank-spec.md`
   - `references/brand-tokens.md`
   - `references/composition-recipes.md`
3. `paperclip-content/videos/wireframe-skill-launch/src/HeroCapsuleBank.tsx` - working Remotion implementation.

## 坐标系

| 属性 | 值 |
| --- | --- |
| ViewBox | `0 0 1200 675` |
| Background | `#141413` |
| Square crop | `viewBox="250 -19 700 700"` |
| Columns | 8 |
| Capsules per column | 12 |
| Total capsules | 96 |

## 胶囊形状

| 属性 | 值 |
| --- | --- |
| Width | 70 |
| Height | 170 |
| Radius | 35 |
| Rect anchor | `x=-35`, `y=-85` |
| Positioning | translate each rect to center `(cx, cy)` |

胶囊主体保持刚性。波浪动效中绝不能拉伸或变形胶囊。

## 布局

| 列 | `tx` | `ty0` |
| --- | --- | --- |
| 0 | 355 | 154.464 |
| 1 | 425 | 161.240 |
| 2 | 495 | 101.067 |
| 3 | 565 | 111.908 |
| 4 | 635 | 137.808 |
| 5 | 705 | 181.764 |
| 6 | 775 | 150.630 |
| 7 | 845 | 123.362 |

Formula:

```txt
STRIDE_Y = 380 / 11
cx = tx[column]
cy = ty0[column] + slot * STRIDE_Y
```

绘制顺序按列从 0..7 排列，每列内按槽位从 0..11 排列。槽位索引越大，绘制越靠后，会覆盖较小索引的胶囊。

## 渐变调色板

每组渐变都是包含两个色标的线性渐变，角度以度为单位。

| ID | 角度 | 顶部 | 底部 |
| --- | --- | --- | --- |
| g0 | 90.000 | `#3c23fb` | `#fb8b24` |
| g1 | 90.000 | `#6721fa` | `#f85f1c` |
| g2 | 90.000 | `#921ff8` | `#f53215` |
| g3 | 90.000 | `#bd1df7` | `#f10e18` |
| g4 | 90.000 | `#e81bf5` | `#e4103e` |
| g5 | 90.000 | `#f419d3` | `#d7135f` |
| g6 | 90.000 | `#f217a4` | `#ca147b` |
| g7 | 90.000 | `#f11575` | `#be1692` |
| g8 | 90.000 | `#ef1346` | `#b217a4` |
| g9 | 90.000 | `#ec1217` | `#9919a6` |
| g10 | 90.000 | `#e83913` | `#79199a` |
| g11 | 90.000 | `#e36414` | `#5c1a8f` |
| g12 | 118.000 | `#9a031e` | `#ced51c` |
| g13 | 118.727 | `#9a0547` | `#d2bd1c` |
| g14 | 119.455 | `#9a0770` | `#ce9f1c` |
| g15 | 120.182 | `#9a0997` | `#cb821c` |
| g16 | 120.909 | `#770b9a` | `#c8661c` |
| g17 | 121.636 | `#520d9a` | `#c44b1c` |
| g18 | 122.364 | `#2e0f9a` | `#c1311c` |
| g19 | 123.091 | `#12189a` | `#be1c1f` |
| g20 | 123.818 | `#143e9a` | `#bb1b37` |
| g21 | 124.545 | `#16629a` | `#b71b4e` |
| g22 | 125.273 | `#198599` | `#b41b64` |
| g23 | 126.000 | `#1b998b` | `#b11b79` |
| g24 | 127.818 | `#940540` | `#dbd81a` |
| g25 | 137.636 | `#8e065f` | `#e1d419` |
| g26 | 147.455 | `#88077a` | `#e7cf17` |
| g27 | 157.273 | `#720982` | `#ebc817` |
| g28 | 167.091 | `#520a7c` | `#edbf19` |
| g29 | 176.909 | `#360b77` | `#f0b71a` |
| g30 | 186.727 | `#1c0c71` | `#f2ae1c` |
| g31 | 196.545 | `#0d146c` | `#f4a51e` |
| g32 | 206.364 | `#0e2a66` | `#f79d20` |
| g33 | 216.182 | `#0e3c61` | `#f99422` |
| g34 | 226.000 | `#0f4c5c` | `#fb8b24` |
| g35 | 93.273 | `#dc8f15` | `#671a92` |
| g36 | 96.545 | `#d5b716` | `#721a95` |
| g37 | 99.818 | `#c1ce17` | `#7d1a98` |
| g38 | 103.091 | `#93c718` | `#891b9b` |
| g39 | 106.364 | `#68c018` | `#951b9e` |
| g40 | 109.636 | `#41b919` | `#a11ba1` |
| g41 | 112.909 | `#1db31a` | `#a41b9a` |
| g42 | 116.182 | `#1aac38` | `#a81b92` |
| g43 | 119.455 | `#1aa657` | `#ab1b8a` |
| g44 | 122.727 | `#1b9f72` | `#ae1b82` |

SVG template:

```xml
<linearGradient id="g0" gradientUnits="objectBoundingBox"
  x1="0" y1="0" x2="1" y2="0"
  gradientTransform="rotate(90 0.5 0.5)">
  <stop offset="0%" stop-color="#3c23fb" />
  <stop offset="100%" stop-color="#fb8b24" />
</linearGradient>
```

## 各列渐变序列

每个序列依次列出槽位 0..11。

| 列 | 序列 |
| --- | --- |
| 0 | `g0 g1 g2 g3 g4 g5 g6 g7 g8 g9 g10 g11` |
| 1 | `g12 g13 g14 g15 g16 g17 g18 g19 g20 g21 g22 g23` |
| 2 | `g11 g10 g9 g8 g7 g6 g5 g4 g3 g2 g1 g0` |
| 3 | `g23 g22 g21 g20 g19 g18 g17 g16 g15 g14 g13 g12` |
| 4 | `g12 g24 g25 g26 g27 g28 g29 g30 g31 g32 g33 g34` |
| 5 | `g0 g1 g2 g3 g4 g5 g6 g7 g8 g9 g10 g11` |
| 6 | `g11 g35 g36 g37 g38 g39 g40 g41 g42 g43 g44 g23` |
| 7 | `g0 g1 g2 g3 g4 g5 g6 g7 g8 g9 g10 g11` |

## 颗粒叠层

颗粒纹理是图案的一部分。除非输出媒介不支持，否则官方 hero 素材库渲染不得省略。

| 属性 | 值 |
| --- | --- |
| SVG primitive | `feTurbulence type="fractalNoise"` |
| Base frequency | `2.95` |
| Octaves | 5 |
| Seed | 9 |
| Opacity | 0.86 |
| Blend mode | `overlay` |
| Mask | union of capsule shapes only |

Overlay formula per channel:

```txt
overlay(b, o) = 2 * b * o                     if b < 0.5
overlay(b, o) = 1 - 2 * (1 - b) * (1 - o)     otherwise
final = mix(b, overlay(b, o), 0.86)
```

背景像素保持纯净的 `#141413`；颗粒纹理通过蒙版限制在胶囊内部。

## 可选波浪动效

制作动效时，仅沿 y 轴平移每个胶囊，并保持刚性。不要缩放、弯曲或变形胶囊。

| 属性 | 值 |
| --- | --- |
| Wave amplitude | 9 |
| Per-capsule phase step | `PI / 3` |
| Per-column phase factor | `2 * PI / 280` |
| Loop period | 4 seconds |

Formula:

```txt
dy(column, slot, t) =
  9 * sin((2 * PI * t / 4) - (2 * PI / 280) * tx[column] - slot * (PI / 3))
```

若要生成与记录规范一致的静态图，将振幅设为 0，并原样使用 `ty0` 数值。

## 渲染检查清单

1. 绘制背景 `#141413`。
2. 按布局表和渐变序列表绘制 8 列、每列 12 个胶囊。
3. 应用颗粒叠层，并将蒙版限制在胶囊形状内。
4. 导出正方形图时，裁切范围设为 `250 -19 700 700`。
5. 如果添加动画，波浪周期必须精确为 4 秒，并提供减少动态效果/静态输出。
6. 不要添加描边、阴影、光晕、额外渐变或额外胶囊行。
