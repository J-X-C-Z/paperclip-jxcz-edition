import type { Resource } from "i18next";

import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "zh-CN" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages);

const uiTranslations: Record<string, Record<string, unknown>> = {
  en: {
    ui: {
      language: "Language · English",
      switchLanguage: "Switch to 简体中文",
      newTask: "New Task", search: "Search", dashboard: "Dashboard", inbox: "Inbox",
      decisions: "Decisions", status: "Status", conferenceRoom: "Conference Room",
      work: "Work", tasks: "Tasks", cases: "Cases", routines: "Routines", pipelines: "Pipelines",
      goals: "Goals", artifacts: "Artifacts", skills: "Skills", workspaces: "Workspaces",
      projects: "Projects", agents: "Agents", company: "Company", org: "Org", audit: "Audit", recentTasks: "Recent Tasks",
      connectors: "Connectors", browse: "Browse", timeline: "Timeline", costs: "Costs", activity: "Activity", settings: "Settings",
      viewProfile: "View profile", editProfile: "Edit profile", documentation: "Documentation",
      signOut: "Sign out", signingOut: "Signing out...", review: "Review",
      reviewDescription: "Actions your agents want to run that need your OK first. Approve, always-allow, or decline.",
      waitingForOk: "Waiting for your OK", nothingWaiting: "Nothing is waiting for your OK right now.",
      selectOrganization: "Select an organization to review approvals.",
      reviewLoadError: "Could not load connection reviews. Please refresh to try again.",
    },
  },
  "zh-CN": {
    ui: {
      language: "语言 · 简体中文",
      switchLanguage: "切换到 English",
      newTask: "新建任务", search: "搜索", dashboard: "仪表盘", inbox: "收件箱",
      decisions: "决策", status: "状态", conferenceRoom: "会议室",
      work: "工作", tasks: "任务", cases: "案例", routines: "例程", pipelines: "流程",
      goals: "目标", artifacts: "成果", skills: "技能", workspaces: "工作区",
      projects: "项目", agents: "智能体", company: "公司", org: "组织架构", audit: "审计", recentTasks: "最近任务",
      connectors: "连接器", browse: "浏览", timeline: "时间线", costs: "成本", activity: "动态", settings: "设置",
      viewProfile: "查看个人资料", editProfile: "编辑个人资料", documentation: "使用文档",
      signOut: "退出登录", signingOut: "正在退出…", review: "审批",
      reviewDescription: "智能体请求执行的操作需要你先确认。你可以批准一次、始终允许或拒绝。",
      waitingForOk: "等待你确认", nothingWaiting: "目前没有待你确认的请求。",
      selectOrganization: "请选择公司以查看待审批事项。",
      reviewLoadError: "无法加载连接器审批记录，请刷新页面后重试。",
    },
  },
};

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [
    locale,
    { translation: { ...(messages as Record<string, unknown>), ...uiTranslations[locale] } },
  ]),
) as Resource;

export type SupportedLocale = keyof typeof localeMessages;
