// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentExternalConversations } from "./AgentExternalConversations";

const mocks = vi.hoisted(() => ({ conversations: vi.fn(), conversation: vi.fn() }));
vi.mock("@/api/bridge", () => ({ bridgeApi: mocks }));
vi.mock("@/components/MarkdownBody", () => ({ MarkdownBody: ({ children }: { children: string }) => <div data-body>{children}</div> }));
vi.mock("@/components/PageSkeleton", () => ({ PageSkeleton: () => <div>加载中</div> }));
const session = { conversationId: "session-1", agentId: "agent-1", projectId: null, issueId: null, startedAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z" };
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
async function render(companyId = "company-1", agentId = "agent-1") {
  await act(async () => root.render(<QueryClientProvider client={client}><AgentExternalConversations companyId={companyId} agentId={agentId}/></QueryClientProvider>));
  await settle();
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.conversations.mockResolvedValue({ items: [session], nextCursor: null });
  mocks.conversation.mockResolvedValue({ conversation: session, events: [{ id: "e1", eventKind: "conversation.turn.completed", sourceKey: "e1", occurredAt: session.updatedAt, payload: { data: { conversation_history: [{ role: "user", content: "原始需求" }], assistant_response: "完整正文末尾" } } }], usage: [] });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

describe("external conversation board view", () => {
  it("shows full history, final answer and unknown fees from the backend contract", async () => {
    await render();
    expect(mocks.conversations).toHaveBeenCalledWith("company-1", "agent-1", undefined);
    expect(mocks.conversation).toHaveBeenCalledWith("company-1", "session-1");
    expect(container.querySelector("[data-body]")?.textContent).toContain("完整正文末尾");
    expect(container.textContent).toContain("原始需求");
    expect(container.textContent).toContain("费用未知");
  });
  it("keeps the loading view and never requests detail before a session exists", async () => {
    mocks.conversations.mockReturnValue(new Promise(() => {}));
    await render();
    expect(container.textContent).toContain("加载中");
    expect(mocks.conversation).not.toHaveBeenCalled();
  });
  it("shows an empty view without making a detail request on refresh", async () => {
    mocks.conversations.mockResolvedValue({ items: [], nextCursor: null });
    await render();
    expect(container.textContent).toContain("尚未同步外部会话");
    const refresh = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "刷新")!;
    await act(async () => refresh.click()); await settle();
    expect(mocks.conversation).not.toHaveBeenCalled();
  });
  it("makes a detail failure visible and allows retry", async () => {
    mocks.conversation.mockRejectedValueOnce(new Error("数据库暂不可用"));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("数据库暂不可用");
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重试正文")!;
    await act(async () => retry.click()); await settle();
    expect(container.querySelector("[data-body]")?.textContent).toContain("完整正文末尾");
  });
  it("does not retain another company's transcript while a new scope loads", async () => {
    await render();
    mocks.conversations.mockReturnValue(new Promise(() => {}));
    await render("company-2", "agent-2");
    expect(container.textContent).not.toContain("完整正文末尾");
    expect(container.textContent).toContain("加载中");
  });
});
