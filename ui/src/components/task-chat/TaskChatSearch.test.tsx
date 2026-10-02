// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import { TaskChatSearch, taskChatSearchRows } from "./TaskChatSearch";
import type { TaskChatItem } from "./task-chat-model";

const items: TaskChatItem[] = [
  { id: "one", renderKey: "stable-one", kind: "message", author: "human", text: "核查 Xcode 安装" },
  { id: "two", kind: "message", author: "agent", text: "XCODE 已就绪" },
  { id: "tool", kind: "tool", name: "Read", status: "completed", detail: "private tool log" },
];
let host: HTMLDivElement; let root: Root;
const scroll = vi.fn();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  host = document.body.appendChild(document.createElement("div")); root = createRoot(host);
  vi.stubGlobal("scrollIntoView", scroll);
  HTMLElement.prototype.scrollIntoView = scroll;
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); scroll.mockClear(); vi.unstubAllGlobals(); });
function Fixture({ rows, layout = "desktop" }: { rows: TaskChatItem[]; layout?: string }) {
  const scope = useRef<HTMLDivElement>(null);
  return <div ref={scope}><TaskChatSearch items={rows} scope={scope} />{rows.filter(row => row.kind === "message").map(row => <div key={`${layout}:${row.id}`} data-thread-anchor={row.kind === "message" ? row.renderKey ?? row.id : row.id}>{row.kind === "message" ? row.text : ""}</div>)}</div>;
}
async function render(rows = items) { await act(async () => root.render(<Fixture rows={rows} />)); }
async function click(label: string) { await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()); }
async function find(text: string) {
  const input = host.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("searches message text without reading tool details", () => {
  expect(taskChatSearchRows(items).map(row => row.anchor)).toEqual(["stable-one", "two"]);
});
it("finds Chinese and case-insensitive messages, navigates and clears the marker on Escape", async () => {
  await render(); await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  await find("xcode");
  expect(host.querySelector('[role="status"]')?.textContent).toBe("1 / 2");
  expect(host.querySelector('[data-chat-search-match="true"]')?.getAttribute("data-thread-anchor")).toBe("stable-one");
  await click("下一条匹配消息");
  expect(host.querySelector('[role="status"]')?.textContent).toBe("2 / 2");
  expect(host.querySelector('[data-chat-search-match="true"]')?.getAttribute("data-thread-anchor")).toBe("two");
  await click("上一条匹配消息");
  expect(scroll).toHaveBeenCalledTimes(3);
  await act(async () => host.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(host.querySelector("input")).toBeNull();
  expect(host.querySelector('[data-chat-search-match="true"]')).toBeNull();
});
it("does not move the reading position when streaming recreates unchanged matches", async () => {
  await render(); await act(async () => host.querySelector<HTMLButtonElement>("button")!.click()); await find("Xcode");
  scroll.mockClear(); await render(items.map(row => ({ ...row })));
  expect(scroll).not.toHaveBeenCalled();
  await find("没有此内容");
  expect(host.querySelector('[role="status"]')?.textContent).toBe("没有匹配的消息");
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="下一条匹配消息"]')!.disabled).toBe(true);
  expect(host.querySelector('[data-chat-search-match="true"]')).toBeNull();
});

it("reattaches the highlight when responsive layout replaces message rows without moving the reader", async () => {
  await render(); await act(async () => host.querySelector<HTMLButtonElement>("button")!.click()); await find("Xcode");
  const original = host.querySelector('[data-chat-search-match="true"]');
  scroll.mockClear();
  await act(async () => root.render(<Fixture rows={items} layout="mobile" />));
  const replacement = host.querySelector('[data-chat-search-match="true"]');
  expect(replacement).not.toBeNull();
  expect(replacement).not.toBe(original);
  expect(replacement?.getAttribute("data-thread-anchor")).toBe("stable-one");
  expect(scroll).not.toHaveBeenCalled();
});
