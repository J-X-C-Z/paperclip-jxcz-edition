// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BriefWorkspace } from "./BriefWorkspace";

const mocks = vi.hoisted(() => ({ list: vi.fn(), settings: vi.fn(), generate: vi.fn(), updateSettings: vi.fn(), agents: vi.fn() }));
vi.mock("@/api/briefs", async (original) => ({ ...await original<typeof import("@/api/briefs")>(), briefsApi: mocks }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: mocks.agents } }));
vi.mock("@/components/MarkdownBody", () => ({ MarkdownBody: ({ children }: { children: string }) => <div>{children}</div> }));
vi.mock("@/components/ConfigureBuiltInAgentModal", () => ({ ConfigureBuiltInAgentModal: () => null }));
vi.mock("@/lib/router", async () => ({ Link: (await import("react-router-dom")).Link }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
async function render(companyId = "c1", projectId: string | null = "p1") {
  await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><BriefWorkspace key={`${companyId}:${projectId}`} companyId={companyId} projectId={projectId} /></QueryClientProvider></MemoryRouter>));
  await settle();
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
  await settle();
}

describe("native brief workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    mocks.list.mockResolvedValue([{ id: "b1", title: "当前验收", body: "原始需求与未验收事项", createdAt: "2026-10-04T00:00:00Z" }]);
    mocks.settings.mockResolvedValue({ secretaryAgentId: "a1", secretaryAgent: { id: "a1", name: "秘书", status: "idle" }, enabled: true });
    mocks.generate.mockResolvedValue({ issueId: "task1", status: "queued" });
    mocks.agents.mockResolvedValue([{ id: "a1", name: "秘书", status: "idle" }, { id: "a2", name: "新秘书", status: "idle" }]);
    mocks.updateSettings.mockResolvedValue({ secretaryAgentId: "a2" });
  });
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

  it("reads scoped persisted content and submits generation without implying completion", async () => {
    await render();
    expect(mocks.list).toHaveBeenCalledWith("c1", "p1");
    expect(container.textContent).toContain("原始需求与未验收事项");
    await click("生成简报");
    expect(mocks.generate).toHaveBeenCalledWith("c1", "p1");
    expect(container.querySelector('a[href="/issues/task1"]')).not.toBeNull();
    expect(container.textContent).toContain("完成并投送后会出现在下方");
  });

  it("keeps history available when secretary is paused and prevents generation", async () => {
    mocks.settings.mockResolvedValue({ secretaryAgentId: "a1", secretaryAgent: { id: "a1", name: "秘书", status: "paused" }, enabled: false });
    await render();
    expect(container.textContent).toContain("原始需求与未验收事项");
    expect(Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "生成简报")?.disabled).toBe(true);
  });

  it("shows historical authorship after the author agent has been deleted", async () => {
    mocks.list.mockResolvedValue([{ id: "b1", title: "归档", body: "历史报告", authorAgentId: null, authorAgentName: "原秘书", createdAt: "2026-10-04T00:00:00Z" }]);
    await render();
    expect(container.textContent).toContain("署名：原秘书");
    expect(container.textContent).toContain("历史报告");
  });

  it("persists a company agent secretary selection", async () => {
    await render();
    await click("配置秘书");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "a2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("保存");
    expect(mocks.updateSettings).toHaveBeenCalledWith("c1", "a2");
  });

  it("changes companies without showing the previous company's history", async () => {
    await render();
    mocks.list.mockImplementation((companyId: string) => companyId === "c2" ? new Promise(() => {}) : Promise.resolve([]));
    await render("c2", null);
    expect(mocks.list).toHaveBeenCalledWith("c2", null);
    expect(container.textContent).not.toContain("原始需求与未验收事项");
  });

  it("surfaces generation failures", async () => {
    mocks.generate.mockRejectedValue(new Error("秘书执行预算不足"));
    await render();
    await click("生成简报");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("秘书执行预算不足");
  });
});
