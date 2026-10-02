// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskChatBubbleActions } from "./TaskChatBubbleActions";
import { i18n } from "@/i18n";
const copy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: copy }));
let host: HTMLDivElement; let root: Root;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(async () => { await i18n.changeLanguage("zh-CN"); host = document.body.appendChild(document.createElement("div")); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); copy.mockReset(); });
it("announces copy failures and recovers after retry", async () => {
  copy.mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<TaskChatBubbleActions copyText="完整消息" />));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("复制失败");
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(copy).toHaveBeenLastCalledWith("完整消息");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("消息已复制");
});
