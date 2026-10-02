import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { createAcpxEngineExecutor } from "@paperclipai/adapter-utils/acpx-engine/execute";
import { DEFAULT_ACP_ENGINE_MODE, DEFAULT_ACP_ENGINE_NON_INTERACTIVE_PERMISSIONS, DEFAULT_ACP_ENGINE_PERMISSION_MODE } from "@paperclipai/adapter-utils/acpx-engine/constants";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_MIMOCODE_MODEL } from "../index.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRootDir = path.resolve(moduleDir, "../..");
const executor = createAcpxEngineExecutor({ adapterType: "mimocode_local", moduleDir, packageRootDir });

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = { ...ctx.config };
  const command = asString(config.command, "mimo").trim() || "mimo";
  const model = asString(config.model, DEFAULT_MIMOCODE_MODEL).trim() || DEFAULT_MIMOCODE_MODEL;
  const env = parseObject(config.env);
  const runConfig = {
    provider: {
      mimo: {
        npm: "@ai-sdk/openai-compatible",
        name: "MiMo",
        options: {
          baseURL: "https://api.xiaomimimo.com/v1",
          headers: { "api-key": "{env:MIMO_API_KEY}" },
        },
        models: { "mimo-v2.5-pro": { name: "MiMo V2.5 Pro" } },
      },
    },
    model,
  };
  return executor({ ...ctx, config: {
    ...config,
    model,
    agent: "mimocode",
    agentCommand: `${command} acp`,
    env: { ...env, MIMOCODE_CONFIG_CONTENT: JSON.stringify(runConfig) },
    mode: asString(config.mode, DEFAULT_ACP_ENGINE_MODE),
    permissionMode: asString(config.permissionMode, DEFAULT_ACP_ENGINE_PERMISSION_MODE),
    nonInteractivePermissions: asString(config.nonInteractivePermissions, DEFAULT_ACP_ENGINE_NON_INTERACTIVE_PERMISSIONS),
  } });
}

export { sessionCodec } from "@paperclipai/adapter-utils/acpx-engine/session-codec";
export { testEnvironment } from "./test.js";
export { getConfigSchema } from "./config-schema.js";
