import { buildSandboxNpmInstallCommand } from "@paperclipai/adapter-utils";

export const type = "mimocode_local";
export const label = "MiMo Code (local)";
export const SANDBOX_INSTALL_COMMAND = buildSandboxNpmInstallCommand("@mimo-ai/cli");
export const DEFAULT_MIMOCODE_MODEL = "mimo/mimo-v2.5-pro";
export const models = [{ id: DEFAULT_MIMOCODE_MODEL, label: "MiMo V2.5 Pro" }];
export const agentConfigurationDoc = `# mimocode_local agent configuration

Adapter: mimocode_local

Runs the MiMo Code CLI using its Agent Client Protocol mode (mimo acp). The Xiaomi MiMo provider uses the API key saved in Paperclip Connections and an isolated per-run config. The adapter defaults to mimo/mimo-v2.5-pro; set command to override the executable (default: mimo).`;
