/** Reviewed workspace snapshot; never interpreted as live task status. */
export const briefCompanyId = "2ae03c21-9745-4209-b202-edf4ffa70a6a";
export const briefSnapshotAt = "2026-10-03 20:40（北京时间）";
export type Verdict = "met" | "partial" | "unverified";
export interface TaskBrief {
  id: string;
  title: string;
  stage: string;
  requirement: string;
  current: string;
  verdict: Verdict;
  gap: string;
  evidence: string[];
  next: string;
  sources: string[];
  intervention?: {
    title: string;
    reason: string;
    setup: string;
    steps: string[];
    pass: string;
    returnEvidence: string;
  };
}
export const taskBriefs: TaskBrief[] = [
  {
    id: "TASK-039", title: "手机与手环同步", stage: "进行中", verdict: "unverified",
    requirement: "手机数据真正同步到小米手环，并完成真机验收。",
    current: "SDK 与同步协议已接入；手机现已在线，手环状态待确认，真机验收仍缺证据。",
    gap: "缺真实节点、通信、持久保存确认和重开后数据保留的证据。旧记录中的手机断连已解除。",
    evidence: ["15 项定向检查及 Android 构建通过。", "本次只读核对确认手机已在线；现有记录尚无完整真机成功证据。"],
    next: "手环可用后，由代理继续原生联调、采集日志并修复问题；核对手环实际保存后的回执。",
    sources: ["tasks/in_progress/TASK-039.json", "repo/mobile/lib/features/wear/README.md", "decisions/ADR-008-wear-account-read-source.md", "本次只读核对：Android 设备在线"],
    intervention: {
      title: "让手环可连接，配合安装与授权",
      reason: "手机现已在线；手环连接与安装状态尚未确认，需要你配合实体设备操作。",
      setup: "小米手环在附近，小米运动健康可用；由代理先确认手机与手环应用的安装和签名。",
      steps: ["让手环保持可连接；若手环应用未安装，按官方或既有开发路径配合安装。", "出现设备管理授权提示时，在设备上完成授权；告诉代理设备已就绪。", "由代理执行发现、Ping/Pong 与同步；需要现场确认时，核对手环显示并重开应用检查数据。"],
      pass: "真实设备通信成功，收到手环持久保存后的确认，重开后数据仍正确；仅显示发送成功不算通过。",
      returnEvidence: "设备是否就绪；若授权或显示失败，提供失败步骤、发生时间和画面。日志由代理采集。",
    },
  },
  {
    id: "TASK-043", title: "双设备 Hermes 与手机弹窗", stage: "待审阅", verdict: "partial",
    requirement: "只显示 Mac / Azure 聊天入口；不串设备，弹窗为卡片，设备与会话可改名。",
    current: "已构建并安装到手机；Azure 部署、真实回复及弹窗视觉验收仍待完成。",
    gap: "缺 Azure Hermes 在线注册、真实消息往返，以及手机弹窗与改名的现场验收。",
    evidence: ["手机套件 274 项通过，2 项真实服务检查跳过。", "Android 包已安装；设备改名不改变真实路由 ID。"],
    next: "部署完成后，代理确认在线设备，验证真实往返、离线不转发与改名持久化；手机空闲时检查弹窗。",
    sources: ["tasks/review/TASK-043.json", "manager/hermes-mobile-switch-20261003.md", "manager/evidence/TASK-043/acceptance.json"],
    intervention: {
      title: "完成 Azure Hermes 部署，告知可联调时间",
      reason: "原安排明确由你完成 Azure（Aozora）部署；后续手机与服务器联调由代理继续。",
      setup: "按现有部署交接运行 Hermes Gateway，启用 Orialis 平台插件；使用交接中已准备的配置。",
      steps: ["在 Azure / Aozora 按交接完成 Hermes 部署与启动；普通 CLI 启动不能代替平台插件连接。", "告知部署完成和手机可空闲的时间，让代理确认 Azure 入口在线并执行消息往返。", "仅在代理无法操作或需要你判断观感时，配合检查卡片弹窗和设备、会话改名。"],
      pass: "Mac、Azure 分别收到目标设备回复，不串设备；离线不转投另一端；名称重开后保留，手机弹窗显示正常。",
      returnEvidence: "部署结果、可联调时间；若失败，提供错误现象和发生时间，请勿回传令牌或密钥。",
    },
  },
  {
    id: "TASK-041", title: "手机独立连接 Mac / Aozora", stage: "进行中", verdict: "unverified",
    requirement: "会话持久绑定目标设备，消息与控制不串设备；离线不能转发到另一台。",
    current: "双入口界面已有相关交付，但任务记录尚缺独立会话的真实往返证据。",
    gap: "需要逐项验证会话绑定、控制隔离与离线不转发。与 TASK-043 合并联调，避免重复操作。",
    evidence: ["原始要求明确禁止用模拟或设备配对代替真实聊天。", "TASK-043 有界面与安装结果，真实往返仍未验收。"],
    next: "代理合并两项任务的验收项，Azure 部署后检查独立会话与离线边界并留证。",
    sources: ["tasks/in_progress/TASK-041.json", "tasks/review/TASK-043.json"],
  },
  {
    id: "TASK-021", title: "桌面与手机多端联合验收", stage: "部分交付", verdict: "partial",
    requirement: "Mac、Android、Linux 协同可用；业务增删改、离线恢复与重启后数据正确。",
    current: "协议、部分服务与生命周期检查通过；原生界面和手机↔桌面完整业务往返未验收。",
    gap: "缺原生增删改、删除同步、断网恢复、冲突/鉴权失败及休眠唤醒的完整证据。",
    evidence: ["已有协议 fixtures、部分本地真实 HTTP 与 Linux Node 验证。", "这些结果不能代替 Mac 原生操作和跨设备业务验收。"],
    next: "代理先确认隔离测试账号及原生操作能力，再执行验收矩阵；确需你建立账号或手动操作时提出具体请求。",
    sources: ["tasks/review/TASK-021.json", "tasks/active/TASK-025.json", "docs/reviews/TASK-021-desktop-takeover.md", "manager/multidevice-joint-acceptance.md", "manager/TASK-033-review.md"],
  },
  {
    id: "TASK-038", title: "手环日视图：先核对任务记录", stage: "记录冲突", verdict: "unverified",
    requirement: "推进手环纯日视图与视觉优化；先确认同号任务对应的正确目标。",
    current: "工作区存在“手环日视图”和“新版 Logo”两份同号任务，暂不能给出可靠完成结论。",
    gap: "需消除编号与目标冲突，再核对原始要求；不能将其他手环任务的证据算到本项。",
    evidence: ["in_progress 与 active 目录各有一份 TASK-038，目标不同。"],
    next: "协调代理核对来源并拆分、更正任务；只有无法恢复原始意图时才请你决定。",
    sources: ["tasks/in_progress/TASK-038.json", "tasks/active/TASK-038.json", "state.md"],
  },
  {
    id: "TASK-044", title: "Paperclip 任务简报页面", stage: "待审阅", verdict: "partial",
    requirement: "清楚展示任务简况、是否达到当初要求，以及需要你亲自处理的问题。",
    current: "插件已安装；页面改为任务对照与操作步骤，展示核对后的工作记录快照。",
    gap: "本次排版等待你审阅；尚未自动读取秘书新报告，快照不代表持续更新的任务状态。",
    evidence: ["本地插件已安装且页面可加载。", "本次依照新要求重排，明确显示数据覆盖范围与核对时间。"],
    next: "代理完成界面检查，保留摘要来源；真实报告自动同步须另行提供接入证据。",
    sources: ["tasks/review/TASK-044.json", "Paperclip: packages/plugins/orialis-brief/src/ui/index.tsx", "用户本次页面重排要求"],
  },
  {
    id: "TASK-045", title: "秘书首份真实项目报告", stage: "待审阅", verdict: "partial",
    requirement: "由 Orialis 秘书依据现行任务生成真实报告，归档后供你审阅。",
    current: "首份报告已归档 ORI-71；其中个别阶段已落后于最新记录，新格式尚待执行。",
    gap: "需按新要求补齐逐任务达成判断，并刷新过时阶段；报告归档不代表页面同步或每日定时已完成。",
    evidence: ["秘书运行成功，文档 API 读回八个要求字段。", "TASK-044/045 已进入 review，旧报告仍记录较早阶段；本页使用新核对结果。"],
    next: "秘书按新契约逐任务对照原始要求与证据，更新报告时保留版本；不把本页摘要当作秘书新报告。",
    sources: ["tasks/review/TASK-045.json", "Paperclip: ORI-71 / project-brief"],
  },
  {
    id: "TASK-042", title: "日程与资讯手机布局统一", stage: "已完成", verdict: "met",
    requirement: "统一导航、卡片、筛选和账号控件，检查窄屏、大字号与真实 Android 显示。",
    current: "布局统一完成，手机安装与实际界面已核对；真实资讯内容仍为空。",
    gap: "达成范围是布局与控件。生产资讯缓存为空，有内容场景只有模拟数据验证。",
    evidence: ["32 项定向检查通过，相关静态检查通过。", "Android 包已安装，实际手机界面已核对。"],
    next: "真实资讯恢复后由代理补查内容展示；当前没有需要你亲自调试的布局阻塞。",
    sources: ["tasks/done/TASK-042.json", "state.md"],
  },
];
