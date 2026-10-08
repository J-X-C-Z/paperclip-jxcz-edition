import { Command } from "commander";
import { createAgentKeySchema, createBoardApiKeySchema, type Agent } from "@paperclipai/shared";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface AgentTokenOptions extends BaseClientOptions {
  companyId?: string;
  agent?: string;
  name?: string;
}

interface BoardTokenOptions extends BaseClientOptions {
  companyId?: string;
  name?: string;
  expiresAt?: string;
  ttlDays?: string;
  neverExpires?: boolean;
}

interface CreatedAgentKey {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

interface AgentKeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

interface CreatedBoardKey {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

interface BoardKeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

export function registerTokenCommands(program: Command): void {
  const token = program.command("token").description("管理 Paperclip API 令牌");
  const agent = token.command("agent").description("管理智能体 API 密钥");

  addCommonClientOptions(
    agent
      .command("create")
      .description("创建智能体 API 密钥")
      .requiredOption("-C, --company-id <id>", "公司 ID")
      .requiredOption("--agent <agent>", "智能体 ID、简称或唯一名称")
      .option("--name <name>", "API 密钥标签", "cli-agent")
      .action(async (opts: AgentTokenOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const agentRow = await resolveAgent(ctx.api, ctx.companyId ?? "", opts.agent ?? "");
          const payload = createAgentKeySchema.parse({ name: opts.name });
          const key = await ctx.api.post<CreatedAgentKey>(apiPath`/api/agents/${agentRow.id}/keys`, payload);
          if (!key) throw new Error("创建智能体 API 密钥失败");
          printOutput(
            {
              agentId: agentRow.id,
              agentName: agentRow.name,
              companyId: agentRow.companyId,
              key,
            },
            { json: ctx.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("list")
      .description("列出智能体 API 密钥")
      .requiredOption("-C, --company-id <id>", "公司 ID")
      .requiredOption("--agent <agent>", "智能体 ID、简称或唯一名称")
      .action(async (opts: AgentTokenOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const agentRow = await resolveAgent(ctx.api, ctx.companyId ?? "", opts.agent ?? "");
          const keys = (await ctx.api.get<AgentKeyRow[]>(apiPath`/api/agents/${agentRow.id}/keys`)) ?? [];
          if (ctx.json) {
            printOutput({ agentId: agentRow.id, companyId: agentRow.companyId, keys }, { json: true });
            return;
          }
          for (const key of keys) {
            console.log(formatInlineRecord({ id: key.id, name: key.name, createdAt: key.createdAt, revokedAt: key.revokedAt ?? null }));
          }
          if (keys.length === 0) printOutput([], { json: false });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("revoke")
      .description("撤销智能体 API 密钥")
      .argument("<keyId>", "智能体 API 密钥 ID")
      .requiredOption("-C, --company-id <id>", "公司 ID")
      .requiredOption("--agent <agent>", "智能体 ID、简称或唯一名称")
      .action(async (keyId: string, opts: AgentTokenOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const agentRow = await resolveAgent(ctx.api, ctx.companyId ?? "", opts.agent ?? "");
          const result = await ctx.api.delete<{ ok: true; keyId?: string }>(apiPath`/api/agents/${agentRow.id}/keys/${keyId}`);
          printOutput({ ok: true, agentId: agentRow.id, companyId: agentRow.companyId, ...(result ?? {}) }, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  const board = token.command("board").description("管理看板 API 密钥");

  addCommonClientOptions(
    board
      .command("create")
      .description("创建命名看板 API 密钥")
      .option("-C, --company-id <id>", "用于审计上下文的公司 ID")
      .option("--name <name>", "API 密钥标签", "cli-board")
      .option("--expires-at <iso8601>", "过期时间戳")
      .option("--ttl-days <days>", "从现在起多少天后过期")
      .option("--never-expires", "创建永不过期的密钥")
      .action(async (opts: BoardTokenOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const expiresAt = resolveBoardKeyExpiresAt(opts);
          const payload = createBoardApiKeySchema.parse({
            name: opts.name,
            requestedCompanyId: opts.companyId ?? ctx.companyId ?? null,
            expiresAt,
          });
          const key = await ctx.api.post<CreatedBoardKey>("/api/board-api-keys", payload);
          if (!key) throw new Error("创建看板 API 密钥失败");
          printOutput({ key }, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    board
      .command("list")
      .description("列出当前看板用户的看板 API 密钥")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const keys = (await ctx.api.get<BoardKeyRow[]>("/api/board-api-keys")) ?? [];
          if (ctx.json) {
            printOutput(keys, { json: true });
            return;
          }
          for (const key of keys) {
            console.log(formatInlineRecord({
              id: key.id,
              name: key.name,
              createdAt: key.createdAt,
              lastUsedAt: key.lastUsedAt,
              expiresAt: key.expiresAt,
              revokedAt: key.revokedAt,
            }));
          }
          if (keys.length === 0) printOutput([], { json: false });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    board
      .command("revoke")
      .description("撤销看板 API 密钥")
      .argument("<keyId>", "看板 API 密钥 ID")
      .action(async (keyId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const result = await ctx.api.delete<{ ok: true; keyId: string }>(apiPath`/api/board-api-keys/${keyId}`);
          printOutput(result ?? { ok: true, keyId }, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

async function resolveAgent(api: { get<T>(path: string): Promise<T | null> }, companyId: string, agentRef: string): Promise<Agent> {
  const trimmed = agentRef.trim();
  if (!trimmed) throw new Error("必须提供智能体引用");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    const agent = await api.get<Agent>(apiPath`/api/agents/${trimmed}`);
    if (!agent || agent.companyId !== companyId) throw new Error(`未找到智能体：${agentRef}`);
    return agent;
  }
  const query = new URLSearchParams({ companyId });
  const agent = await api.get<Agent>(`${apiPath`/api/agents/${trimmed}`}?${query.toString()}`);
  if (!agent || agent.companyId !== companyId) throw new Error(`未找到智能体：${agentRef}`);
  return agent;
}

function resolveBoardKeyExpiresAt(opts: BoardTokenOptions): Date | null | undefined {
  if (opts.neverExpires) return null;
  if (opts.expiresAt?.trim()) {
    const date = new Date(opts.expiresAt.trim());
    if (!Number.isFinite(date.getTime())) throw new Error(`--expires-at 值无效：${opts.expiresAt}`);
    return date;
  }
  if (opts.ttlDays?.trim()) {
    const days = Number(opts.ttlDays);
    if (!Number.isFinite(days) || days <= 0) throw new Error(`--ttl-days 值无效：${opts.ttlDays}`);
    return new Date(Date.now() + Math.floor(days * 24 * 60 * 60 * 1000));
  }
  return undefined;
}
