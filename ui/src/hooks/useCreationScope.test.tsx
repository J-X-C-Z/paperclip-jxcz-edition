// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreationScope } from "./useCreationScope";

const { state } = vi.hoisted(() => ({ state: { scope: null as null | { enabled: boolean; projectId: string | null; loading: boolean; error: Error | null } } }));
vi.mock("@/context/ProjectScopeContext", () => ({ useOptionalProjectScope: () => state.scope }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
const hosts: HTMLElement[] = [];
function Probe() {
  const { ready, projectId } = useCreationScope();
  return <output>{JSON.stringify({ ready, projectId })}</output>;
}
async function readScope() {
  const host = document.createElement("div"); document.body.append(host); hosts.push(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<Probe />));
  return JSON.parse(host.textContent!);
}
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
});
describe("creation project scope", () => {
  it("allows company creation when the feature is off despite a cached project error", async () => {
    state.scope = { enabled: false, projectId: "stale-project", loading: false, error: new Error("Cached project fetch failed") };
    expect(await readScope()).toEqual({ ready: true, projectId: null });
  });
  it("blocks creation while enabled scope is loading or failed", async () => {
    state.scope = { enabled: true, projectId: null, loading: true, error: null };
    expect(await readScope()).toEqual({ ready: false, projectId: null });
    state.scope = { enabled: true, projectId: "project-a", loading: false, error: new Error("Project unavailable") };
    expect(await readScope()).toEqual({ ready: false, projectId: null });
  });
  it("inherits a validated project and preserves company-only callers", async () => {
    state.scope = { enabled: true, projectId: "project-a", loading: false, error: null };
    expect(await readScope()).toEqual({ ready: true, projectId: "project-a" });
    state.scope = null;
    expect(await readScope()).toEqual({ ready: true, projectId: null });
  });
});
