import { describe, expect, it } from "vitest";
import type { ModelSwitchProfile } from "@paperclipai/shared";
import {
  buildTitleGroups,
  NO_TITLE_GROUP,
  planAgentPatch,
  planProfileApply,
  profileFromGroups,
  type SwitchableAgent,
} from "./model-switch-plan";

function agent(partial: Partial<SwitchableAgent> & { id: string }): SwitchableAgent {
  return {
    name: partial.id,
    title: "组员",
    adapterType: "codex_local",
    adapterConfig: { model: "gpt-6-luna" },
    ...partial,
  };
}

describe("model switch plan", () => {
  it("groups agents by title and reports the majority current assignment", () => {
    const groups = buildTitleGroups([
      agent({ id: "a", title: "组员" }),
      agent({ id: "b", title: "组员", adapterConfig: { model: "mimo/mimo-v2.6-flash" }, adapterType: "mimocode_local" }),
      agent({ id: "c", title: "组员" }),
      agent({ id: "d", title: "组长", adapterConfig: { model: "gpt-6.1-sol" } }),
      agent({ id: "e", title: null }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["组员", "组长", NO_TITLE_GROUP]);
    expect(groups[0]!.current).toEqual({ adapterType: "codex_local", model: "gpt-6-luna" });
    expect(groups[1]!.current).toEqual({ adapterType: "codex_local", model: "gpt-6.1-sol" });
  });

  it("patches only real changes, skips process agents, and repoints pinned connections", () => {
    expect(planAgentPatch(agent({ id: "a" }), { adapterType: "codex_local", model: "gpt-6-luna" })).toBeNull();
    expect(
      planAgentPatch(agent({ id: "p", adapterType: "process" }), { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-flash" }),
    ).toBeNull();

    const pinned = agent({
      id: "b",
      runtimeConfig: { aiConnection: { mode: "responsible_user", method: "subscription", provider: "openai" }, heartbeat: { enabled: true } },
    });
    const patch = planAgentPatch(pinned, { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-pro" });
    expect(patch).toMatchObject({
      adapterType: "mimocode_local",
      adapterConfig: { model: "mimo/mimo-v2.6-pro" },
      runtimeConfig: {
        heartbeat: { enabled: true },
        aiConnection: { mode: "responsible_user", method: "api_key", provider: "xiaomi_mimo" },
      },
    });

    const unpinned = agent({ id: "c" });
    expect(planAgentPatch(unpinned, { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-flash" })).toEqual({
      adapterType: "mimocode_local",
      adapterConfig: { model: "mimo/mimo-v2.6-flash" },
    });
  });

  it("applies title overrides with a default fallback", () => {
    const profile: ModelSwitchProfile = {
      name: "p",
      default: { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-flash" },
      titles: { 组长: { adapterType: "mimocode_local", model: "mimo/mimo-v2.6-pro" } },
    };
    const changes = planProfileApply(
      [
        agent({ id: "m1" }),
        agent({ id: "lead", title: "组长" }),
        agent({ id: "m2", adapterType: "mimocode_local", adapterConfig: { model: "mimo/mimo-v2.6-flash" } }),
      ],
      profile,
    );
    expect(changes.map((c) => [c.agent.id, c.patch.adapterConfig.model])).toEqual([
      ["m1", "mimo/mimo-v2.6-flash"],
      ["lead", "mimo/mimo-v2.6-pro"],
    ]);
  });

  it("captures the current state as a profile", () => {
    const groups = buildTitleGroups([
      agent({ id: "a", title: "组员" }),
      agent({ id: "b", title: "组员" }),
      agent({ id: "c", title: "组长", adapterConfig: { model: "gpt-6.1-sol" } }),
    ]);
    const profile = profileFromGroups(groups, "备份");
    expect(profile.name).toBe("备份");
    expect(profile.default).toEqual({ adapterType: "codex_local", model: "gpt-6-luna" });
    expect(profile.titles["组长"]).toEqual({ adapterType: "codex_local", model: "gpt-6.1-sol" });
  });
});
