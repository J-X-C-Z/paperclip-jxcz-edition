import { Command } from "commander";
import pc from "picocolors";
import {
  readContext,
  resolveContextPath,
  resolveProfile,
  setCurrentProfile,
  upsertProfile,
  type ClientContextProfile,
} from "../../client/context.js";
import { printOutput } from "./common.js";

interface ContextOptions {
  dataDir?: string;
  context?: string;
  profile?: string;
  json?: boolean;
}

interface ContextSetOptions extends ContextOptions {
  apiBase?: string;
  companyId?: string;
  persona?: "board" | "agent";
  agentId?: string;
  agentName?: string;
  apiKeyEnvVarName?: string;
  use?: boolean;
}

export function registerContextCommands(program: Command): void {
  const context = program.command("context").description("管理 CLI 客户端上下文配置");

  context
    .command("show")
    .description("显示当前上下文和活动配置")
    .option("-d, --data-dir <path>", "Paperclip 数据目录根路径（将状态与 ~/.paperclip 隔离）")
    .option("--context <path>", "CLI 上下文文件路径")
    .option("--profile <name>", "要检查的配置")
    .option("--json", "输出原始 JSON")
    .action((opts: ContextOptions) => {
      const contextPath = resolveContextPath(opts.context);
      const store = readContext(opts.context);
      const resolved = resolveProfile(store, opts.profile);
      const payload = {
        contextPath,
        currentProfile: store.currentProfile,
        profileName: resolved.name,
        profile: resolved.profile,
        profiles: store.profiles,
      };
      printOutput(payload, { json: opts.json });
    });

  context
    .command("list")
    .description("列出可用上下文配置")
    .option("-d, --data-dir <path>", "Paperclip 数据目录根路径（将状态与 ~/.paperclip 隔离）")
    .option("--context <path>", "CLI 上下文文件路径")
    .option("--json", "输出原始 JSON")
    .action((opts: ContextOptions) => {
      const store = readContext(opts.context);
      const rows = Object.entries(store.profiles).map(([name, profile]) => ({
        name,
        current: name === store.currentProfile,
        apiBase: profile.apiBase ?? null,
        companyId: profile.companyId ?? null,
        persona: profile.persona ?? null,
        agentId: profile.agentId ?? null,
        agentName: profile.agentName ?? null,
        apiKeyEnvVarName: profile.apiKeyEnvVarName ?? null,
      }));
      printOutput(rows, { json: opts.json });
    });

  context
    .command("use")
    .description("设置当前上下文配置")
    .argument("<profile>", "配置名称")
    .option("-d, --data-dir <path>", "Paperclip 数据目录根路径（将状态与 ~/.paperclip 隔离）")
    .option("--context <path>", "CLI 上下文文件路径")
    .action((profile: string, opts: ContextOptions) => {
      setCurrentProfile(profile, opts.context);
      console.log(pc.green(`Active profile set to '${profile}'.`));
    });

  context
    .command("set")
    .description("设置配置项的值")
    .option("-d, --data-dir <path>", "Paperclip 数据目录根路径（将状态与 ~/.paperclip 隔离）")
    .option("--context <path>", "CLI 上下文文件路径")
    .option("--profile <name>", "配置名称（默认：当前配置）")
    .option("--api-base <url>", "默认 API 基础 URL")
    .option("--company-id <id>", "默认公司 ID")
    .option("--persona <persona>", "配置身份：board 或 agent")
    .option("--agent-id <id>", "agent 身份对应的默认智能体 ID")
    .option("--agent-name <name>", "默认智能体显示名称")
    .option("--api-key-env-var-name <name>", "包含 API 密钥的环境变量（推荐）")
    .option("--use", "将此配置设为当前配置")
    .option("--json", "输出原始 JSON")
    .action((opts: ContextSetOptions) => {
      const existing = readContext(opts.context);
      const targetProfile = opts.profile?.trim() || existing.currentProfile || "default";

      upsertProfile(
        targetProfile,
        buildContextPatch(opts),
        opts.context,
      );

      if (opts.use) {
        setCurrentProfile(targetProfile, opts.context);
      }

      const updated = readContext(opts.context);
      const resolved = resolveProfile(updated, targetProfile);
      const payload = {
        contextPath: resolveContextPath(opts.context),
        currentProfile: updated.currentProfile,
        profileName: resolved.name,
        profile: resolved.profile,
      };

      if (!opts.json) {
        console.log(pc.green(`Updated profile '${targetProfile}'.`));
        if (opts.use) {
          console.log(pc.green(`Set '${targetProfile}' as active profile.`));
        }
      }
      printOutput(payload, { json: opts.json });
    });
}

function setIfProvided<K extends keyof ClientContextProfile>(
  patch: Partial<ClientContextProfile>,
  key: K,
  value: ClientContextProfile[K] | undefined,
): void {
  if (value !== undefined) {
    patch[key] = value;
  }
}

function buildContextPatch(opts: ContextSetOptions): Partial<ClientContextProfile> {
  const patch: Partial<ClientContextProfile> = {};
  setIfProvided(patch, "apiBase", opts.apiBase);
  setIfProvided(patch, "companyId", opts.companyId);
  setIfProvided(patch, "persona", parsePersona(opts.persona));
  setIfProvided(patch, "agentId", opts.agentId);
  setIfProvided(patch, "agentName", opts.agentName);
  setIfProvided(patch, "apiKeyEnvVarName", opts.apiKeyEnvVarName);
  return patch;
}

function parsePersona(value: string | undefined): "board" | "agent" | undefined {
  if (value === undefined) return undefined;
  if (value === "board" || value === "agent") return value;
  throw new Error("--persona 值无效。请使用 board 或 agent。");
}
