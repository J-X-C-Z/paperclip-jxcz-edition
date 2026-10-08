import type { ProjectSnapshot } from "../brief-types.js";

export const orialisWorkspacePreview: ProjectSnapshot = {
  id: "workspace:orialis",
  name: "Orialis",
  status: "active",
  summary: "Local workspace preview from current Orialis records. The Secretary report is available separately at ORI-71/project-brief; this page is not connected to it.",
  snapshotDate: "2026-10-03",
  source: {
    kind: "workspace-preview",
    label: "Local workspace preview · ORI-71 report not linked",
    note: "Compiled from the listed Orialis workspace records for UI review. The Secretary report is saved separately at ORI-71/project-brief; this preview does not read that document or link to a verified Paperclip project ID.",
    records: [
      "state.md",
      "tasks/done/TASK-042.json",
      "tasks/review/TASK-043.json",
      "tasks/in_progress/TASK-041.json",
      "tasks/in_progress/TASK-039.json",
      "tasks/review/TASK-044.json",
      "tasks/review/TASK-045.json",
    ],
  },
  brief: {
    schemaVersion: "1.0",
    date: "2026-10-03",
    currentFocus: "推进手机多设备与手环工作；Brief UI 与 Secretary 报告已分别交付审阅，预览页面尚未接入报告。",
    completed: [
      {
        text: "TASK-042 已完成：统一日程与资讯手机布局；32 项定向检查通过，Android 包安装并核对了实际手机界面。生产资讯缓存仍为空，内容展示只由 fixture 验证。",
        sourceRef: "tasks/done/TASK-042.json",
      },
    ],
    inProgress: [
      {
        text: "TASK-041：继续打通手机与 Mac/Aozora 的独立 Hermes 会话；离线设备不得转发到另一设备。",
        sourceRef: "tasks/in_progress/TASK-041.json",
      },
      {
        text: "TASK-038：手环纯日视图与视觉优化仍在进行中。",
        sourceRef: "tasks/in_progress/TASK-038.json",
      },
      {
        text: "TASK-039：继续小米 SDK 同步工作；当前任务记录的真机联调尚未开始，记录原因为设备断开。",
        sourceRef: "tasks/in_progress/TASK-039.json",
      },
    ],
    decisions: [
      {
        text: "本次已通过当前 Paperclip API 确认 Orialis 公司和秘书，并由 Secretary 生成报告；这个预览页面仍与报告分离。",
        sourceRef: "ORI-71#document-project-brief",
      },
      {
        text: "TASK-043 仍处于 review；测试、构建和安装不代表 Azure 消息往返或手机视觉验收完成。",
        sourceRef: "tasks/review/TASK-043.json",
      },
      {
        text: "TASK-044 的插件已安装且 Brief 页面已加载，现供 UI 审阅；页面仍使用静态预览数据，没有读取 Secretary 发布文档。",
        sourceRef: "tasks/review/TASK-044.json",
      },
    ],
    issues: [
      {
        text: "TASK-045 已进入 review：Secretary 报告已保存至 ORI-71/project-brief；当前页面预览尚未接入该文档。",
        sourceRef: "ORI-71#document-project-brief",
      },
      {
        text: "本地 TASK-038 有两份目标不同的记录，尚待确认哪份是权威记录。",
        sourceRef: "tasks/in_progress/TASK-038.json · tasks/active/TASK-038.json",
      },
      {
        text: "TASK-043 剩余 Azure Hermes 实际消息往返、手机弹窗与改名的视觉验收。",
        sourceRef: "tasks/review/TASK-043.json",
      },
      {
        text: "TASK-039 的物理设备验收记录为 not_started_device_disconnected。",
        sourceRef: "tasks/in_progress/TASK-039.json",
      },
    ],
    next: [
      {
        text: "审阅 Secretary 保存到 ORI-71/project-brief 的正式简报；若希望在本页面显示报告内容，需另行接通文档数据。",
        sourceRef: "ORI-71#document-project-brief",
      },
      {
        text: "审阅已安装的 Brief 预览 UI；当前页面明确标记为静态预览，尚未连接 Secretary 文档。",
        sourceRef: "tasks/review/TASK-044.json",
      },
      {
        text: "按 TASK-041、TASK-043 与 TASK-039 各自验收边界继续真实设备联调。",
        sourceRef: "tasks/in_progress/TASK-041.json · tasks/review/TASK-043.json · tasks/in_progress/TASK-039.json",
      },
    ],
    important: "本页仍是静态 Orialis 工作区预览。Secretary 已生成并归档正式简报到 ORI-71/project-brief，但本页尚未接入该文档。",
    attention: [
      {
        id: "secretary-publication",
        severity: "warning",
        title: "正式秘书简报已单独归档",
        text: "可在 ORI-71 的 project-brief 文档查看；此 Brief 页面仍展示未接入文档的静态预览。",
        sourceRef: "ORI-71#document-project-brief",
      },
      {
        id: "hermes-roundtrip",
        severity: "warning",
        title: "Azure Hermes 往返与手机视觉验收待完成",
        text: "TASK-043 保持 review，尚有真实消息往返和手机界面验收。",
        sourceRef: "tasks/review/TASK-043.json",
      },
      {
        id: "wear-device",
        severity: "warning",
        title: "手环真机联调未开始",
        text: "TASK-039 记录物理设备未连接，尚未开始真机验收。",
        sourceRef: "tasks/in_progress/TASK-039.json",
      },
    ],
    timeline: [
      {
        id: "task-042",
        date: "2026-10-03",
        label: "TASK-042 完成",
        text: "手机日程与资讯布局统一完成；设备界面已检查，生产资讯内容仍为空。",
        sourceRef: "tasks/done/TASK-042.json",
      },
      {
        id: "task-043",
        date: "2026-10-03",
        label: "TASK-043 进入 review",
        text: "Android debug 包已安装；真实 Azure 往返和手机视觉验收仍待完成。",
        sourceRef: "tasks/review/TASK-043.json",
      },
      {
        id: "task-044",
        date: "2026-10-03",
        label: "TASK-044 已交付审阅",
        text: "Brief 页面已在本机 Paperclip 加载并可打开；页面使用静态预览数据，未读取 Secretary 发布文档。",
        sourceRef: "tasks/review/TASK-044.json",
      },
      {
        id: "task-045",
        date: "2026-10-03",
        label: "TASK-045 简报已生成",
        text: "Secretary 已将 2026-10-03 简报保存到 ORI-71/project-brief，等待负责人审阅。",
        sourceRef: "ORI-71#document-project-brief",
      },
    ],
  },
};

const exampleSource = {
  kind: "synthetic-example" as const,
  label: "Example project · synthetic data",
  note: "仅用于检查 Brief 状态布局，不代表 Orialis 或任何真实 Paperclip 项目。",
  records: ["built-in UI example fixture"],
};

function example(
  id: string,
  name: string,
  status: ProjectSnapshot["status"],
  summary: string,
  important: string,
  options: { attention?: boolean; empty?: boolean; long?: boolean } = {},
): ProjectSnapshot {
  const text = options.long
    ? `${important} ${"这是用于验证窄窗口换行和长文本截断边界的合成示例。".repeat(22)}`
    : important;
  const brief = options.empty ? null : {
    schemaVersion: "1.0" as const,
    date: "2026-10-03",
    currentFocus: summary,
    completed: status === "completed" ? [{ text: "示例工作已完成，等待负责人检查结果。", sourceRef: "synthetic fixture" }] : [],
    inProgress: status === "active" ? [{ text: "正在执行示例任务，当前状态仅用于 UI 展示。", sourceRef: "synthetic fixture" }] : [],
    decisions: [{ text: "保留可追溯来源并显示项目状态。", sourceRef: "synthetic fixture" }],
    issues: status === "blocked" ? [{ text: "合成阻塞：等待依赖团队提供输入。", sourceRef: "synthetic fixture" }] : [],
    next: [{ text: "检查示例简报后继续下一步。", sourceRef: "synthetic fixture" }],
    important: text,
    attention: options.attention ? [{
      id: `${id}-attention`, severity: status === "blocked" ? "blocked" as const : "warning" as const,
      title: "Example attention item", text: "This synthetic item demonstrates the attention state.", sourceRef: "synthetic fixture",
    }] : [],
    timeline: [{ id: `${id}-event`, date: "2026-10-03", label: "Example update", text, sourceRef: "synthetic fixture" }],
  };
  return { id, name, status, summary, snapshotDate: "2026-10-03", source: exampleSource, brief };
}

export const exampleProjects: ProjectSnapshot[] = [
  example("ex-active", "Atlas planning", "active", "Active project with a current focus.", "The team is preparing a sample milestone.", { attention: true }),
  example("ex-waiting", "Mercury research", "waiting", "Waiting for an external decision.", "A synthetic wait state with no claimed real dependency."),
  example("ex-blocked", "Pinecone migration", "blocked", "Blocked by a sample dependency.", "This example demonstrates a blocked project.", { attention: true }),
  example("ex-stale", "Harbor redesign", "stale", "No recent source update in this example.", "This example demonstrates a stale status."),
  example("ex-completed", "Nightjar export", "completed", "The example work is complete.", "Review the synthetic completion record."),
  example("ex-archived", "Delta runtime", "archived", "An archived example project.", "Archived example; no active work is implied."),
  example("ex-empty", "Untitled lab", "waiting", "An example project with no published brief.", "No brief content exists in this fixture.", { empty: true }),
  example("ex-long", "Long text preview", "active", "A synthetic long-text rendering example.", "Long example text.", { long: true }),
];
