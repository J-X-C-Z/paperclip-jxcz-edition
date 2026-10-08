# 完整示例

以下是四份可复制并修改的完整线框图。每份都是有效的独立 SVG 文件。生成线框图并回复用户时，应提供每个示例下方对应的标注列表。

---

## 1. 登录屏幕（手机，375×812）

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="812" viewBox="0 0 375 812"
     font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="#000" stroke-width="1.5">
  <rect x="0" y="0" width="375" height="812" />

  <!-- 1: status bar (placeholder) -->
  <g transform="translate(16, 16)">
    <text x="0" y="14" font-size="12" stroke="none" fill="#666">9:41</text>
    <text x="343" y="14" font-size="12" text-anchor="end" stroke="none" fill="#666">100%</text>
  </g>

  <!-- 2: brand mark -->
  <g transform="translate(159, 120)">
    <rect width="56" height="56" rx="8" fill="#e6e6e6" />
  </g>

  <!-- 3: title -->
  <text x="187" y="216" font-size="28" font-weight="700" text-anchor="middle" stroke="none" fill="#000">Welcome back</text>
  <text x="187" y="248" font-size="14" text-anchor="middle" stroke="none" fill="#666">Sign in to continue</text>

  <!-- 4: email field -->
  <g transform="translate(16, 296)">
    <text x="0" y="14" font-size="14" font-weight="600" stroke="none" fill="#000">Email</text>
    <g transform="translate(0, 24)">
      <rect width="343" height="48" rx="4" />
      <text x="12" y="30" font-size="14" stroke="none" fill="#666">you@example.com</text>
    </g>
  </g>

  <!-- 5: password field -->
  <g transform="translate(16, 400)">
    <text x="0" y="14" font-size="14" font-weight="600" stroke="none" fill="#000">Password</text>
    <g transform="translate(0, 24)">
      <rect width="343" height="48" rx="4" />
      <text x="12" y="30" font-size="14" stroke="none" fill="#666">••••••••</text>
      <text x="331" y="30" font-size="12" text-anchor="end" stroke="none" fill="#666">show</text>
    </g>
    <text x="343" y="92" font-size="12" text-anchor="end" stroke="none" fill="#666">Forgot password?</text>
  </g>

  <!-- 6: primary CTA -->
  <g transform="translate(16, 528)">
    <rect width="343" height="48" rx="4" fill="#000" />
    <text x="171" y="30" font-size="14" font-weight="600" text-anchor="middle" stroke="none" fill="#fff">Sign in</text>
  </g>

  <!-- 7: divider -->
  <g transform="translate(16, 600)">
    <line x1="0" y1="8" x2="140" y2="8" stroke="#666" />
    <text x="171" y="12" font-size="12" text-anchor="middle" stroke="none" fill="#666">or</text>
    <line x1="203" y1="8" x2="343" y2="8" stroke="#666" />
  </g>

  <!-- 8: secondary CTA -->
  <g transform="translate(16, 632)">
    <rect width="343" height="48" rx="4" />
    <text x="171" y="30" font-size="14" text-anchor="middle" stroke="none" fill="#000">Continue with SSO</text>
  </g>

  <!-- 9: footer -->
  <text x="187" y="744" font-size="14" text-anchor="middle" stroke="none" fill="#000">New here? <tspan font-weight="600">Create an account</tspan></text>
</svg>
```

**标注：**
1. 状态栏占位内容
2. 品牌标记
3. 页面标题和副标题
4. 邮箱输入框
5. 密码输入框、显示/隐藏控件和忘记密码链接
6. 主要操作按钮（登录）
7. SSO 分隔线
8. 次要操作按钮（SSO）
9. 注册链接

---

## 2. 管理后台（桌面，1280×800）

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"
     font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="#000" stroke-width="1.5">
  <rect x="0" y="0" width="1280" height="800" />

  <!-- 1: sidebar -->
  <g transform="translate(0, 0)" data-region="sidebar">
    <rect width="240" height="800" />
    <text x="24" y="40" font-size="20" font-weight="600" stroke="none" fill="#000">Acme</text>
    <rect x="0" y="80" width="240" height="40" fill="#e6e6e6" />
    <text x="24" y="105" font-size="14" stroke="none" fill="#000">Dashboard</text>
    <text x="24" y="153" font-size="14" stroke="none" fill="#666">Projects</text>
    <text x="24" y="201" font-size="14" stroke="none" fill="#666">Reports</text>
    <text x="24" y="249" font-size="14" stroke="none" fill="#666">Team</text>
    <text x="24" y="297" font-size="14" stroke="none" fill="#666">Settings</text>
  </g>

  <!-- 2: top bar -->
  <g transform="translate(240, 0)" data-region="topbar">
    <rect width="1040" height="64" />
    <g transform="translate(24, 12)">
      <rect width="400" height="40" rx="20" />
      <circle cx="20" cy="20" r="6" />
      <line x1="24" y1="24" x2="30" y2="30" />
      <text x="40" y="25" font-size="14" stroke="none" fill="#666">Search…</text>
    </g>
    <circle cx="1000" cy="32" r="16" fill="#e6e6e6" />
  </g>

  <!-- 3: page header -->
  <g transform="translate(264, 96)" data-region="header">
    <text x="0" y="28" font-size="28" font-weight="700" stroke="none" fill="#000">Dashboard</text>
    <text x="0" y="56" font-size="14" stroke="none" fill="#666">Overview of activity for the last 7 days</text>
    <g transform="translate(872, 0)">
      <rect width="120" height="40" rx="4" fill="#000" />
      <text x="60" y="25" font-size="14" font-weight="600" text-anchor="middle" stroke="none" fill="#fff">New project</text>
    </g>
  </g>

  <!-- 4: metric tiles -->
  <g transform="translate(264, 184)" data-region="metrics">
    <g transform="translate(0, 0)">
      <rect width="232" height="120" rx="6" />
      <text x="24" y="40" font-size="12" stroke="none" fill="#666">Active users</text>
      <text x="24" y="80" font-size="28" font-weight="700" stroke="none" fill="#000">1,284</text>
      <text x="24" y="104" font-size="12" stroke="none" fill="#666">+12% vs last week</text>
    </g>
    <g transform="translate(256, 0)">
      <rect width="232" height="120" rx="6" />
      <text x="24" y="40" font-size="12" stroke="none" fill="#666">New signups</text>
      <text x="24" y="80" font-size="28" font-weight="700" stroke="none" fill="#000">312</text>
      <text x="24" y="104" font-size="12" stroke="none" fill="#666">+4%</text>
    </g>
    <g transform="translate(512, 0)">
      <rect width="232" height="120" rx="6" />
      <text x="24" y="40" font-size="12" stroke="none" fill="#666">Revenue</text>
      <text x="24" y="80" font-size="28" font-weight="700" stroke="none" fill="#000">$24.1k</text>
      <text x="24" y="104" font-size="12" stroke="none" fill="#666">+8%</text>
    </g>
    <g transform="translate(768, 0)">
      <rect width="232" height="120" rx="6" />
      <text x="24" y="40" font-size="12" stroke="none" fill="#666">Churn</text>
      <text x="24" y="80" font-size="28" font-weight="700" stroke="none" fill="#000">1.4%</text>
      <text x="24" y="104" font-size="12" stroke="none" fill="#666">−0.3%</text>
    </g>
  </g>

  <!-- 5: chart placeholder -->
  <g transform="translate(264, 328)" data-region="chart">
    <rect width="640" height="320" rx="6" />
    <text x="24" y="40" font-size="20" font-weight="600" stroke="none" fill="#000">Activity</text>
    <rect x="24" y="64" width="592" height="232" fill="#e6e6e6" />
    <line x1="24" y1="64" x2="616" y2="296" stroke="#666" />
    <line x1="616" y1="64" x2="24" y2="296" stroke="#666" />
  </g>

  <!-- 6: recent items list -->
  <g transform="translate(920, 328)" data-region="recent">
    <rect width="336" height="320" rx="6" />
    <text x="24" y="40" font-size="20" font-weight="600" stroke="none" fill="#000">Recent</text>
    <g transform="translate(0, 64)">
      <line x1="0" y1="0" x2="336" y2="0" stroke="#666" />
      <circle cx="32" cy="28" r="12" fill="#e6e6e6" />
      <text x="56" y="24" font-size="14" font-weight="600" stroke="none" fill="#000">Item one</text>
      <text x="56" y="40" font-size="12" stroke="none" fill="#666">2h ago</text>
    </g>
    <g transform="translate(0, 120)">
      <line x1="0" y1="0" x2="336" y2="0" stroke="#666" />
      <circle cx="32" cy="28" r="12" fill="#e6e6e6" />
      <text x="56" y="24" font-size="14" font-weight="600" stroke="none" fill="#000">Item two</text>
      <text x="56" y="40" font-size="12" stroke="none" fill="#666">5h ago</text>
    </g>
    <g transform="translate(0, 176)">
      <line x1="0" y1="0" x2="336" y2="0" stroke="#666" />
      <circle cx="32" cy="28" r="12" fill="#e6e6e6" />
      <text x="56" y="24" font-size="14" font-weight="600" stroke="none" fill="#000">Item three</text>
      <text x="56" y="40" font-size="12" stroke="none" fill="#666">1d ago</text>
    </g>
  </g>
</svg>
```

**标注：**
1. 侧边栏导航，当前项为“Dashboard”
2. 顶栏，含全局搜索和账户菜单
3. 页面标题区，含标题、副标题和主要操作按钮
4. 四个 KPI 指标卡片
5. 活动图表面板（图表区域以占位内容显示）
6. 最近项目列表（右侧栏）

---

## 3. 设置表单页（桌面，1280×800）

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"
     font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="#000" stroke-width="1.5">
  <rect x="0" y="0" width="1280" height="800" />

  <!-- 1: top bar -->
  <g transform="translate(0, 0)">
    <rect width="1280" height="64" />
    <text x="24" y="40" font-size="20" font-weight="600" stroke="none" fill="#000">Settings</text>
    <circle cx="1240" cy="32" r="16" fill="#e6e6e6" />
  </g>

  <!-- 2: settings nav (left rail) -->
  <g transform="translate(24, 96)">
    <text x="0" y="14" font-size="12" font-weight="600" stroke="none" fill="#666">PERSONAL</text>
    <rect x="-8" y="32" width="216" height="32" fill="#e6e6e6" />
    <text x="0" y="52" font-size="14" stroke="none" fill="#000">Account</text>
    <text x="0" y="84" font-size="14" stroke="none" fill="#666">Notifications</text>
    <text x="0" y="116" font-size="14" stroke="none" fill="#666">Sessions</text>
    <text x="0" y="160" font-size="12" font-weight="600" stroke="none" fill="#666">WORKSPACE</text>
    <text x="0" y="200" font-size="14" stroke="none" fill="#666">Members</text>
    <text x="0" y="232" font-size="14" stroke="none" fill="#666">Billing</text>
    <text x="0" y="264" font-size="14" stroke="none" fill="#666">Integrations</text>
  </g>

  <!-- 3: form content -->
  <g transform="translate(264, 96)">
    <text x="0" y="28" font-size="28" font-weight="700" stroke="none" fill="#000">Account</text>
    <text x="0" y="56" font-size="14" stroke="none" fill="#666">Manage your personal account details.</text>

    <!-- avatar field -->
    <g transform="translate(0, 96)">
      <text x="0" y="14" font-size="14" font-weight="600" stroke="none" fill="#000">Profile photo</text>
      <g transform="translate(0, 24)">
        <circle cx="32" cy="32" r="32" fill="#e6e6e6" />
        <line x1="9" y1="9" x2="55" y2="55" stroke="#666" />
        <line x1="55" y1="9" x2="9" y2="55" stroke="#666" />
      </g>
      <g transform="translate(80, 36)">
        <rect width="120" height="40" rx="4" />
        <text x="60" y="25" font-size="14" text-anchor="middle" stroke="none" fill="#000">Upload</text>
      </g>
    </g>

    <!-- name field -->
    <g transform="translate(0, 216)">
      <text x="0" y="14" font-size="14" font-weight="600" stroke="none" fill="#000">Display name</text>
      <g transform="translate(0, 24)">
        <rect width="480" height="40" rx="4" />
        <text x="12" y="25" font-size="14" stroke="none" fill="#000">Alex Morgan</text>
      </g>
    </g>

    <!-- email field -->
    <g transform="translate(0, 312)">
      <text x="0" y="14" font-size="14" font-weight="600" stroke="none" fill="#000">Email</text>
      <g transform="translate(0, 24)">
        <rect width="480" height="40" rx="4" />
        <text x="12" y="25" font-size="14" stroke="none" fill="#000">alex@acme.com</text>
      </g>
      <text x="0" y="84" font-size="12" stroke="none" fill="#666">Used for sign-in and notifications.</text>
    </g>

    <!-- role dropdown -->
    <g transform="translate(0, 432)">
      <text x="0" y="14" font-size="14" font-weight="600" stroke="none" fill="#000">Role</text>
      <g transform="translate(0, 24)">
        <rect width="200" height="40" rx="4" />
        <text x="12" y="25" font-size="14" stroke="none" fill="#000">Admin</text>
        <polyline points="180,17 188,25 180,33" fill="none" />
      </g>
    </g>

    <!-- footer actions -->
    <g transform="translate(0, 552)">
      <line x1="0" y1="0" x2="800" y2="0" stroke="#666" />
      <g transform="translate(560, 24)">
        <rect width="120" height="40" rx="4" />
        <text x="60" y="25" font-size="14" text-anchor="middle" stroke="none" fill="#000">Cancel</text>
      </g>
      <g transform="translate(688, 24)">
        <rect width="112" height="40" rx="4" fill="#000" />
        <text x="56" y="25" font-size="14" font-weight="600" text-anchor="middle" stroke="none" fill="#fff">Save</text>
      </g>
    </g>
  </g>
</svg>
```

**标注：**
1. 顶栏，显示分区名称
2. 设置子导航（个人/工作区分组）
3. 表单：头像上传、显示名称、邮箱和帮助文本、角色下拉框，以及保存/取消操作

---

## 4. 模态确认浮层（桌面，1280×800）

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"
     font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="#000" stroke-width="1.5">
  <rect x="0" y="0" width="1280" height="800" />

  <!-- underlying screen (faded) -->
  <g transform="translate(0,0)" opacity="0.5">
    <rect width="1280" height="64" />
    <text x="24" y="40" font-size="20" font-weight="600" stroke="none" fill="#000">Projects</text>
  </g>

  <!-- 1: backdrop -->
  <rect x="0" y="0" width="1280" height="800" fill="#000" fill-opacity="0.4" stroke="none" />

  <!-- 2: modal -->
  <g transform="translate(320, 240)" data-region="modal">
    <rect width="640" height="320" rx="6" />
    <text x="24" y="48" font-size="20" font-weight="600" stroke="none" fill="#000">Delete project?</text>
    <line x1="0" y1="72" x2="640" y2="72" />

    <text x="24" y="112" font-size="14" stroke="none" fill="#000">This permanently deletes the project and all its data.</text>
    <text x="24" y="136" font-size="14" stroke="none" fill="#000">This action can't be undone.</text>

    <!-- confirm input -->
    <g transform="translate(24, 168)">
      <text x="0" y="14" font-size="12" stroke="none" fill="#666">Type the project name to confirm</text>
      <g transform="translate(0, 24)">
        <rect width="592" height="40" rx="4" />
        <text x="12" y="25" font-size="14" stroke="none" fill="#666">acme-prod</text>
      </g>
    </g>

    <!-- footer -->
    <line x1="0" y1="248" x2="640" y2="248" />
    <g transform="translate(384, 268)">
      <rect width="120" height="40" rx="4" />
      <text x="60" y="25" font-size="14" text-anchor="middle" stroke="none" fill="#000">Cancel</text>
    </g>
    <g transform="translate(512, 268)">
      <rect width="104" height="40" rx="4" fill="#000" />
      <text x="52" y="25" font-size="14" font-weight="600" text-anchor="middle" stroke="none" fill="#fff">Delete</text>
    </g>
  </g>

  <!-- 3: annotation -->
  <g data-region="annotations">
    <circle cx="976" cy="556" r="12" fill="#fff" stroke="#d33" stroke-dasharray="4 2" />
    <text x="976" y="560" font-size="12" font-weight="700" text-anchor="middle" stroke="none" fill="#d33">1</text>
    <text x="996" y="564" font-size="12" stroke="none" fill="#d33">Disable until input matches project name</text>
  </g>
</svg>
```

**标注：**
1. 背景遮罩使底层页面变暗
2. 确认模态框：标题、正文、输入文本确认字段，以及取消和破坏性确认操作
3. 审核备注（红色虚线）：输入内容与要求匹配前，破坏性按钮必须保持禁用

---

## 多屏流程

输出流程图时，可以在一个 SVG 中将每个屏幕放入独立的 `<g transform="translate(x,0)">`，屏幕之间留出 80px 间距，并使用 `components.md` 中的箭头基本图形连接。也可以每屏输出一个 SVG，再生成 `flow.svg` 汇总图，将缩略图（通过 `transform="scale(0.25)"` 缩放）从左至右排列。两种方式都可以，选择更便于审核者快速浏览的一种。
