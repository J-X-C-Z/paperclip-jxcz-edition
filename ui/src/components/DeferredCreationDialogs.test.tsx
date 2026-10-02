// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeferredCreationDialogs } from "./DeferredCreationDialogs";

const flags = vi.hoisted(() => ({ newIssueOpen: false, newProjectOpen: false, newGoalOpen: false, newAgentOpen: false }));
vi.mock("../context/DialogContext", () => ({ useDialogState: () => flags }));
vi.mock("./NewIssueDialog", () => ({ NewIssueDialog: () => {
  const [draft, setDraft] = useState("");
  return <input aria-label="draft" value={draft} onChange={event => setDraft(event.target.value)} />;
} }));
vi.mock("./NewProjectDialog", () => ({ NewProjectDialog: () => <div>Project dialog</div> }));
vi.mock("./NewGoalDialog", () => ({ NewGoalDialog: () => <div>Goal dialog</div> }));
vi.mock("./NewAgentDialog", () => ({ NewAgentDialog: () => <div>Agent dialog</div> }));

let host: HTMLDivElement;
let root: Root;
const render = () => act(async () => root.render(<DeferredCreationDialogs />));
beforeEach(() => {
  Object.assign(flags, { newIssueOpen: false, newProjectOpen: false, newGoalOpen: false, newAgentOpen: false });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("does not mount closed dialogs and opens only the requested dialog", async () => {
  await render();
  expect(host.childElementCount).toBe(0);
  flags.newProjectOpen = true;
  await render();
  expect(host.textContent).toBe("Project dialog");
  expect(host.querySelector("input")).toBeNull();
});

it("retains the draft and component across closing and reopening", async () => {
  flags.newIssueOpen = true;
  await render();
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "unfinished draft");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  flags.newIssueOpen = false;
  await render();
  flags.newIssueOpen = true;
  await render();
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("unfinished draft");
});
