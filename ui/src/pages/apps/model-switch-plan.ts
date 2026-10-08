import type { ModelSwitchAssignment, ModelSwitchProfile } from "@paperclipai/shared";

/** The agent fields the switch planner needs. `Agent` from the API satisfies it. */
export interface SwitchableAgent {
  id: string;
  name: string;
  title?: string | null;
  adapterType: string;
  adapterConfig?: Record<string, unknown> | null;
  runtimeConfig?: Record<string, unknown> | null;
}

export interface AgentPatch {
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
}

export interface TitleGroup {
  /** Display label for the 头衔 group; "(no title)" buckets agents without one. */
  title: string;
  agents: SwitchableAgent[];
  /** Most common adapter/model in the group. */
  current: ModelSwitchAssignment;
}

export const NO_TITLE_GROUP = "(无头衔)";

/** Per-adapter AI connection bindings, kept compatible with the harness the
 * same way a human operator configures them. Only applied when the agent
 * already pins a binding; unpinned agents resolve their connection at run time. */
const ADAPTER_CONNECTION_BINDING: Record<string, Record<string, unknown>> = {
  codex_local: { mode: "responsible_user", method: "subscription", provider: "openai" },
  claude_local: { mode: "responsible_user", method: "subscription", provider: "anthropic" },
  grok_local: { mode: "responsible_user", method: "subscription", provider: "xai" },
  opencode_local: { mode: "responsible_user", method: "api_key", provider: "openrouter" },
  mimocode_local: { mode: "responsible_user", method: "api_key", provider: "xiaomi_mimo" },
};

function assignmentKey(assignment: ModelSwitchAssignment): string {
  return `${assignment.adapterType}\u0000${assignment.model}\u0000${JSON.stringify(assignment.adapterConfig ?? {})}`;
}

function currentAssignment(agent: SwitchableAgent): ModelSwitchAssignment {
  const config = agent.adapterConfig ?? {};
  const assignment: ModelSwitchAssignment = {
    adapterType: agent.adapterType,
    model: typeof config.model === "string" && config.model ? config.model : "",
  };
  if (typeof config.command === "string" && config.command) {
    assignment.adapterConfig = { command: config.command };
  }
  return assignment;
}

export function buildTitleGroups(agents: SwitchableAgent[]): TitleGroup[] {
  const groups = new Map<string, SwitchableAgent[]>();
  for (const agent of agents) {
    const title = agent.title?.trim() || NO_TITLE_GROUP;
    const bucket = groups.get(title);
    if (bucket) bucket.push(agent);
    else groups.set(title, [agent]);
  }
  return [...groups.entries()]
    .map(([title, members]) => {
      const counts = new Map<string, { count: number; assignment: ModelSwitchAssignment }>();
      for (const agent of members) {
        const assignment = currentAssignment(agent);
        const key = assignmentKey(assignment);
        const entry = counts.get(key);
        if (entry) entry.count += 1;
        else counts.set(key, { count: 1, assignment });
      }
      const current = [...counts.values()].sort((a, b) => b.count - a.count)[0]!.assignment;
      return { title, agents: members, current };
    })
    .sort((a, b) => b.agents.length - a.agents.length);
}

/** Build the PATCH body for one agent toward a target assignment, or null when
 * the agent is already there. Non-model agents (`process`) are never patched. */
export function planAgentPatch(agent: SwitchableAgent, target: ModelSwitchAssignment): AgentPatch | null {
  if (agent.adapterType === "process") return null;
  const current = currentAssignment(agent);
  const command = target.adapterConfig?.command;
  const sameCommand =
    typeof command !== "string" || command === "" || agent.adapterConfig?.command === command;
  if (current.adapterType === target.adapterType && current.model === target.model && sameCommand) {
    return null;
  }
  const patch: AgentPatch = {
    adapterType: target.adapterType,
    adapterConfig: { ...(target.adapterConfig ?? {}), model: target.model },
  };
  const pinned = agent.runtimeConfig?.aiConnection;
  if (pinned && typeof pinned === "object") {
    const binding = ADAPTER_CONNECTION_BINDING[target.adapterType];
    patch.runtimeConfig = {
      ...(agent.runtimeConfig ?? {}),
      aiConnection: binding ?? pinned,
    };
  }
  return patch;
}

export interface PlannedChange {
  agent: SwitchableAgent;
  patch: AgentPatch;
}

/** Plan the full apply of a profile: `default` covers titles without an entry. */
export function planProfileApply(agents: SwitchableAgent[], profile: ModelSwitchProfile): PlannedChange[] {
  const changes: PlannedChange[] = [];
  for (const agent of agents) {
    const title = agent.title?.trim() || NO_TITLE_GROUP;
    const target = profile.titles[title] ?? profile.default;
    const patch = planAgentPatch(agent, target);
    if (patch) changes.push({ agent, patch });
  }
  return changes;
}

/** Capture the current per-title state as a named profile ("保存配置文件"). */
export function profileFromGroups(groups: TitleGroup[], name: string): ModelSwitchProfile {
  const titles: Record<string, ModelSwitchAssignment> = {};
  for (const group of groups) titles[group.title] = group.current;
  const fallback =
    groups.slice().sort((a, b) => b.agents.length - a.agents.length)[0]?.current ??
    ({ adapterType: "codex_local", model: "" } as ModelSwitchAssignment);
  return { name, default: fallback, titles };
}
