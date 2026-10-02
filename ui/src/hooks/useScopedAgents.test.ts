import { describe, expect, it } from "vitest";
import type { Agent } from "@paperclipai/shared";
import { buildScopedOrgTree, filterScopedAgents, legacyAssigneeState, projectAssigneeChoices } from "./useScopedAgents";

function agent(id: string, reportsTo: string | null = null): Agent {
  return { id, name: id, reportsTo, title: "Engineer", role: "engineer", status: "idle" } as Agent;
}

function flatten(nodes: ReturnType<typeof buildScopedOrgTree>): string[] {
  return nodes.flatMap((node) => [node.id, ...flatten(node.reports)]);
}

describe("project scoped agents", () => {
  it("keeps company behavior when scope is off and isolates project A/B memberships", () => {
    const agents = [agent("a"), agent("b"), agent("legacy")];
    const a = [{ agentId: "a" }];
    const b = [{ agentId: "b" }];
    expect(filterScopedAgents(agents, a, false)).toEqual(agents);
    expect(filterScopedAgents(agents, a, true).map((item) => item.id)).toEqual(["a"]);
    expect(filterScopedAgents(agents, b, true).map((item) => item.id)).toEqual(["b"]);
  });

  it("promotes absent parents to roots and preserves multiple real roots once", () => {
    const tree = buildScopedOrgTree([
      agent("root"),
      agent("child", "root"),
      agent("orphan", "not-a-member"),
      agent("other-root"),
    ]);
    expect(tree.map((node) => node.id)).toEqual(["orphan", "other-root", "root"]);
    expect(flatten(tree).sort()).toEqual(["child", "orphan", "other-root", "root"]);
    expect(tree.find((node) => node.id === "orphan")?.reports).toEqual([]);
  });

  it("keeps a legacy assignee distinguishable without requiring reassignment", () => {
    expect(legacyAssigneeState("old-agent", new Set(["member"]))).toBe("legacy");
    expect(legacyAssigneeState("member", new Set(["member"]))).toBe("member");
    expect(legacyAssigneeState(null, new Set(["member"]))).toBe("unassigned");
  });

  it("offers project members and only the current legacy assignment as a Keep choice", () => {
    const agents = [agent("member-a"), agent("member-b"), agent("legacy")];
    expect(projectAssigneeChoices(agents, [{ agentId: "member-a" }], true, "legacy").map(({ id }) => id))
      .toEqual(["member-a", "legacy"]);
    expect(projectAssigneeChoices(agents, [], false, "legacy")).toEqual(agents);
  });
});
