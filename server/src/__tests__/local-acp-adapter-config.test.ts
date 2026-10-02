import { describe, expect, it } from "vitest";
import { getAdapterSessionManagement } from "@paperclipai/adapter-utils";
import { requireServerAdapter } from "../adapters/index.js";

describe("DSH and MiMo ACP configuration", () => {
  it.each(["dsh_local", "mimocode_local"])("exposes %s configuration and persistent session management", async (type) => {
    const adapter = requireServerAdapter(type);
    const schema = await adapter.getConfigSchema!();
    expect(schema.fields.map(field => field.key)).toEqual(expect.arrayContaining(["command", "mode", "permissionMode", "nonInteractivePermissions", "timeoutSec"]));
    expect(schema.fields.find(field => field.key === "mode")?.options?.map(option => option.value)).toEqual(["persistent", "oneshot"]);
    expect(schema.fields.some(field => field.key === "model")).toBe(false);
    expect(adapter.sessionManagement).toEqual(getAdapterSessionManagement(type));
    expect(adapter.sessionManagement?.supportsSessionResume).toBe(true);
  });
});
