// @vitest-environment jsdom

import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupAgent, OrganizationTask } from "@/api/improvementTeams";
import { OrganizationTasks } from "./OrganizationTasks";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(tasks: OrganizationTask[], agents: GroupAgent[], agentIds: string[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root!.render(<OrganizationTasks tasks={tasks} agents={agents} agentIds={agentIds} />));
  return container;
}

const agents: GroupAgent[] = [
  { id: "member-1", name: "林同学", title: "组员", status: "active", reportsTo: "leader-1" },
  { id: "member-2", name: "周同学", title: "组员", status: "active", reportsTo: "leader-1" },
];

const task = (overrides: Partial<OrganizationTask> = {}): OrganizationTask => ({
  id: "task-1",
  identifier: "PAP-21",
  title: "整理用户反馈",
  status: "in_progress",
  assigneeAgentId: "member-1",
  projectId: "project-1",
  projectName: "产品改进",
  ...overrides,
});

afterEach(async () => {
  if (root) root.unmount();
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
});

describe("OrganizationTasks", () => {
  it("shows each eligible assigned task once and links straight to its conversation", () => {
    const view = render([
      task(),
      task({ title: "duplicate should be ignored", identifier: "PAP-22" }),
      task({ id: "unassigned-task", identifier: "PAP-23", assigneeAgentId: null }),
      task({ id: "outside-task", identifier: "PAP-24", assigneeAgentId: "member-2" }),
    ], agents, ["member-1", "member-1"]);

    expect(view.textContent).toContain("进行中的任务");
    expect(view.querySelector('[aria-label="共 1 项任务"]')).not.toBeNull();
    expect(view.textContent).toContain("整理用户反馈");
    expect(view.textContent).toContain("林同学");
    expect(view.textContent).toContain("产品改进");
    expect(view.textContent).not.toContain("duplicate should be ignored");
    expect(view.textContent).not.toContain("outside-task");
    expect(view.querySelectorAll("a[href='/issues/PAP-21']")).toHaveLength(1);
    expect(view.querySelector("a[href='/issues/PAP-21']")?.textContent).toContain("进入会话");
    expect(view.querySelector("a[href='/issues/PAP-22'], a[href='/issues/PAP-23'], a[href='/issues/PAP-24']")).toBeNull();
  });

  it("shows the empty state when no assigned task belongs to the eligible roster", () => {
    const view = render([task({ assigneeAgentId: null })], agents, ["member-1"]);

    expect(view.textContent).toContain("进行中的任务");
    expect(view.querySelector('[aria-label="共 0 项任务"]')).not.toBeNull();
    expect(view.textContent).toContain("暂无进行中的任务");
    expect(view.querySelector("a")).toBeNull();
  });
});
