import { describe, expect, it, vi } from "vitest";
import { createRoutePreloader, routePreloadKey } from "./route-preload";

describe("route code preloading", () => {
  it("matches scoped and unscoped links without conflating detail and filtered lists", () => {
    expect(routePreloadKey("/ORI/agents/all?view=org")).toBe("agents");
    expect(routePreloadKey("/agents/agent-one/runs/run-one")).toBe("agent");
    expect(routePreloadKey("/ORI/issues/ORI-1#comment-one")).toBe("issue");
    expect(routePreloadKey("/projects")).toBe("projects");
    expect(routePreloadKey("/ORI/projects/p-one/team")).toBe("project");
    expect(routePreloadKey("/departments")).toBe("departments");
    expect(routePreloadKey("/inbox/mine")).toBe("inbox");
  });
  it("uses the selected legacy module and ignores unknown, protected and external destinations", () => {
    expect(routePreloadKey("/agents/all", true)).toBe("legacyAgents");
    expect(routePreloadKey("/org", true)).toBe("legacyOrg");
    expect(routePreloadKey("/routines/r-one", true)).toBe("legacyRoutine");
    for (const route of ["https://outside.test/projects", "//outside.test/projects", "/instance/settings", "/agents/new", "/inbox/requests", "/unknown", "/skills/studio", "/apps/connect"]) {
      expect(routePreloadKey(route)).toBeNull();
    }
  });
  it("loads once for repeated intent and different companies, without requesting data", async () => {
    let done!: () => void;
    const load = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
    const preload = createRoutePreloader(load);
    const first = preload("/ORI/projects");
    expect(preload("/JXC/projects")).toBe(first);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("projects");
    done(); await first;
    await preload("/projects");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("keeps navigation available after an import fails and permits another attempt", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("chunk unavailable")).mockResolvedValue(undefined);
    const preload = createRoutePreloader(load);
    await expect(preload("/departments")).resolves.toBeUndefined();
    await preload("/departments");
    expect(load).toHaveBeenCalledTimes(2);
    await preload("/apps/connect");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
