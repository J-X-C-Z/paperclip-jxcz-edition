import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { createAcpxEngineExecutor } from "@paperclipai/adapter-utils/acpx-engine/execute";
import { DEFAULT_ACP_ENGINE_MODE, DEFAULT_ACP_ENGINE_NON_INTERACTIVE_PERMISSIONS, DEFAULT_ACP_ENGINE_PERMISSION_MODE } from "@paperclipai/adapter-utils/acpx-engine/constants";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_DSH_MODEL } from "../index.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRootDir = path.resolve(moduleDir, "../..");
const executor = createAcpxEngineExecutor({ adapterType: "dsh_local", moduleDir, packageRootDir });

export function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const command = asString(ctx.config.command, "dsh").trim() || "dsh";
  const model = asString(ctx.config.model, DEFAULT_DSH_MODEL).trim() || DEFAULT_DSH_MODEL;
  return executor({ ...ctx, config: {
    ...ctx.config,
    agent: "dsh",
    agentCommand: asString(ctx.config.agentCommand, `${command} --profile acp`),
    model,
    mode: asString(ctx.config.mode, DEFAULT_ACP_ENGINE_MODE),
    permissionMode: asString(ctx.config.permissionMode, DEFAULT_ACP_ENGINE_PERMISSION_MODE),
    nonInteractivePermissions: asString(ctx.config.nonInteractivePermissions, DEFAULT_ACP_ENGINE_NON_INTERACTIVE_PERMISSIONS),
  } });
}

export { sessionCodec } from "@paperclipai/adapter-utils/acpx-engine/session-codec";
export { testEnvironment } from "./test.js";
export { getConfigSchema } from "./config-schema.js";
