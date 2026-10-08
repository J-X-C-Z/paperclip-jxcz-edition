import type { Command } from "commander";
import {
  getStoredBoardCredential,
  loginBoardCli,
  removeStoredBoardCredential,
  revokeStoredBoardCredential,
} from "../../client/board-auth.js";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface AuthLoginOptions extends BaseClientOptions {
  instanceAdmin?: boolean;
  browser?: boolean;
}

interface AuthLogoutOptions extends BaseClientOptions {}
interface AuthWhoamiOptions extends BaseClientOptions {}
interface AuthChallengeOptions extends BaseClientOptions {
  payloadJson?: string;
  token?: string;
  tokenEnv?: string;
}

export function registerClientAuthCommands(auth: Command): void {
  addCommonClientOptions(
    auth
      .command("login")
      .description("验证 CLI 身份以访问看板用户功能")
      .option("--instance-admin", "申请实例管理员审批，而非普通看板访问权限", false)
      .option("--no-browser", "不尝试打开浏览器，仅输出审批 URL")
      .action(async (opts: AuthLoginOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const login = await loginBoardCli({
            apiBase: ctx.api.apiBase,
            requestedAccess: opts.instanceAdmin ? "instance_admin_required" : "board",
            requestedCompanyId: ctx.companyId ?? null,
            command: "paperclipai auth login",
            openBrowser: opts.browser,
          });
          printOutput(
            {
              ok: true,
              apiBase: ctx.api.apiBase,
              userId: login.userId ?? null,
              approvalUrl: login.approvalUrl,
            },
            { json: ctx.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: true },
  );

  addCommonClientOptions(
    auth
      .command("logout")
      .description("移除此 API 地址对应的已存看板用户凭据")
      .action(async (opts: AuthLogoutOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const credential = getStoredBoardCredential(ctx.api.apiBase);
          if (!credential) {
            printOutput({ ok: true, apiBase: ctx.api.apiBase, revoked: false, removedLocalCredential: false }, { json: ctx.json });
            return;
          }
          let revoked = false;
          try {
            await revokeStoredBoardCredential({
              apiBase: ctx.api.apiBase,
              token: credential.token,
            });
            revoked = true;
          } catch {
            // Remove the local credential even if the server-side revoke fails.
          }
          const removedLocalCredential = removeStoredBoardCredential(ctx.api.apiBase);
          printOutput(
            {
              ok: true,
              apiBase: ctx.api.apiBase,
              revoked,
              removedLocalCredential,
            },
            { json: ctx.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    auth
      .command("revoke-current")
      .description("撤销当前看板 API 令牌")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post("/api/cli-auth/revoke-current", {}), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    auth
      .command("whoami")
      .description("显示此 API 地址对应的当前看板用户身份")
      .action(async (opts: AuthWhoamiOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const me = await ctx.api.get<{
            user: { id: string; name: string; email: string } | null;
            userId: string;
            isInstanceAdmin: boolean;
            companyIds: string[];
            source: string;
            keyId: string | null;
          }>("/api/cli-auth/me");
          printOutput(me, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const challenge = auth.command("challenge").description("CLI 身份验证挑战操作");
  addCommonClientOptions(
    challenge
      .command("create")
      .description("创建 CLI 身份验证挑战")
      .requiredOption("--payload-json <json>", "CreateCliAuthChallenge JSON 请求数据")
      .action(async (opts: AuthChallengeOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post("/api/cli-auth/challenges", parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    challenge
      .command("get")
      .description("获取 CLI 身份验证挑战")
      .argument("<id>", "验证挑战 ID")
      .option("--token <token>", "验证挑战密钥")
      .option("--token-env <name>", "从环境变量读取挑战密钥")
      .action(async (id: string, opts: AuthChallengeOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = new URLSearchParams({ token: resolveChallengeToken(opts) });
          printOutput(await ctx.api.get(`${apiPath`/api/cli-auth/challenges/${id}`}?${query.toString()}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  for (const action of ["approve", "cancel"] as const) {
    addCommonClientOptions(
      challenge
        .command(action)
        .description(`${action === "approve" ? "批准" : "取消"} CLI 身份验证挑战`)
        .argument("<id>", "验证挑战 ID")
        .option("--token <token>", "验证挑战密钥")
        .option("--token-env <name>", "从环境变量读取挑战密钥")
        .action(async (id: string, opts: AuthChallengeOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            printOutput(await ctx.api.post(`${apiPath`/api/cli-auth/challenges/${id}`}/${action}`, { token: resolveChallengeToken(opts) }), { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
        }),
    );
  }
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function resolveChallengeToken(opts: AuthChallengeOptions): string {
  const token = opts.token?.trim();
  if (token) return token;
  const envName = opts.tokenEnv?.trim();
  if (envName) {
    const envValue = process.env[envName]?.trim();
    if (envValue) return envValue;
    throw new Error(`环境变量 ${envName} 未设置或为空。`);
  }
  throw new Error("必须提供挑战密钥。请传入 --token 或 --token-env。");
}
