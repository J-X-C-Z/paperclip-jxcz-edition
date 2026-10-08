import { describe, expect, it } from "vitest";
import { isAiConnectionCompatible } from "./ai-connections.js";

describe("MiMo connection compatibility", () => {
  it.each(["shared", "delegated"] as const)("preserves %s API key bindings", (mode) => {
    expect(isAiConnectionCompatible({ provider: "xiaomi_mimo", method: "api_key", mode, connectionId: "00000000-0000-4000-8000-000000000001", grantId: "00000000-0000-4000-8000-000000000002" }, "mimocode_local")).toBe(true);
  });

  it("still validates authoritative provider metadata", () => {
    expect(isAiConnectionCompatible({ provider: "xiaomi_mimo", method: "api_key" }, "mimocode_local")).toBe(true);
    expect(isAiConnectionCompatible({ provider: "google", method: "api_key" }, "mimocode_local")).toBe(false);
    expect(isAiConnectionCompatible({ provider: "xiaomi_mimo", method: "subscription" }, "mimocode_local")).toBe(false);
  });
});
