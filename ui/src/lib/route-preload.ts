import { toCompanyRelativePath } from "./company-routes";
import { AGENT_FILTER_TABS } from "./agent-filter-tabs";

// Loading code does not mount a page or fetch its account/company data. Keep
// this bounded to ordinary sidebar destinations and leave settings/providers
// to their existing guarded routes.
const loaders = {
  dashboard: () => import("../pages/Dashboard"),
  inbox: () => import("../pages/Inbox"),
  issues: () => import("../pages/Issues"),
  issue: () => import("../pages/IssueDetail"),
  projects: () => import("../pages/Projects"),
  project: () => import("../pages/ProjectDetail"),
  agents: () => import("../pages/Agents"),
  agent: () => import("../pages/AgentDetail"),
  departments: () => import("../pages/Departments"),
  groups: () => import("../pages/Groups"),
  templates: () => import("../pages/AgentTemplates"),
  search: () => import("../pages/Search"),
  routines: () => import("../pages/Routines"),
  routine: () => import("../pages/RoutineDetail"),
  artifacts: () => import("../pages/Artifacts"),
  skills: () => import("../pages/CompanySkills"),
  activity: () => import("../pages/audit/CompanyActivity"),
  legacyAgents: () => import("../pages/Agents.production"),
  legacyRoutines: () => import("../pages/Routines.production"),
  legacyRoutine: () => import("../pages/RoutineDetail.production"),
  legacySkills: () => import("../pages/CompanySkills.production"),
  legacyActivity: () => import("../pages/audit/CompanyActivity.production"),
  legacyOrg: () => import("../pages/OrgChart.production"),
};

type RouteModule = keyof typeof loaders;

export function routePreloadKey(to: string, legacy = false): RouteModule | null {
  if (!to.startsWith("/") || to.startsWith("//")) return null;
  const [root, detail] = toCompanyRelativePath(to).split(/[?#]/, 1)[0]!.split("/").filter(Boolean);
  switch (root) {
    case "dashboard": return "dashboard";
    case "inbox": return detail === "requests" ? null : "inbox";
    case "issues": return detail ? "issue" : "issues";
    case "projects": return detail ? "project" : "projects";
    case "agents":
      if (detail === "new") return null;
      if (detail && !(AGENT_FILTER_TABS as readonly string[]).includes(detail)) return "agent";
      return legacy ? "legacyAgents" : "agents";
    case "org": return legacy ? "legacyOrg" : "agents";
    case "departments": return "departments";
    case "groups": return "groups";
    case "templates": return "templates";
    case "search": return "search";
    case "routines": return detail ? legacy ? "legacyRoutine" : "routine" : legacy ? "legacyRoutines" : "routines";
    case "artifacts": return "artifacts";
    case "skills": return detail ? null : legacy ? "legacySkills" : "skills";
    case "activity": return legacy ? "legacyActivity" : "activity";
    default: return null;
  }
}

/** Deduplicate speculative imports; failed imports can be retried on new intent. */
export function createRoutePreloader(load: (key: RouteModule) => Promise<unknown>) {
  const pending = new Map<RouteModule, Promise<void>>();
  return (to: string, legacy = false): Promise<void> => {
    const key = routePreloadKey(to, legacy);
    if (!key) return Promise.resolve();
    let promise = pending.get(key);
    if (!promise) {
      promise = Promise.resolve().then(() => load(key)).then(() => {}, () => { pending.delete(key); });
      pending.set(key, promise);
    }
    return promise;
  };
}

export const preloadBoardRoute = createRoutePreloader(key => loaders[key]());
