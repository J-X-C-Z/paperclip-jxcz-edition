import { Command } from "commander";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface CompanyOptions extends BaseClientOptions {
  companyId?: string;
}

interface JsonPayloadOptions extends CompanyOptions {
  payloadJson?: string;
}

interface QueryOptions extends CompanyOptions {
  query?: string;
  status?: string;
  requestType?: string;
  url?: string;
}

export function registerAccessCommands(program: Command): void {
  addWhoamiCommand(program);
  addCommonClientOptions(
    program
      .command("health")
      .description("检查 API 健康状态")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/health"), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const access = program.command("access").description("访问与身份验证检查操作");
  addWhoamiCommand(access);

  addCommonClientOptions(
    program
      .command("openapi")
      .description("输出 OpenAPI 文档")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/openapi.json"), { json: true });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const profile = program.command("profile").description("当前用户个人资料操作");
  addSimpleGet(profile, "session", "Get auth session", "/api/auth/get-session");
  addSimpleGet(profile, "get", "Get current auth profile", "/api/auth/profile");
  addJsonPatch(profile, "update", "Update current auth profile", "/api/auth/profile");
  addCommonClientOptions(
    profile
      .command("company-user")
      .description("获取公司中的用户个人资料")
      .argument("<userSlug>", "用户标识")
      .option("-C, --company-id <id>", "公司 ID")
      .action(async (userSlug: string, opts: CompanyOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          printOutput(await ctx.api.get(apiPath`/api/companies/${ctx.companyId}/users/${userSlug}/profile`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  const invite = program.command("invite").description("邀请操作");
  addCompanyList(invite, "list", "List company invites", "invites");
  addCompanyPost(invite, "create", "Create an invite", "invites");
  addCommonClientOptions(
    invite
      .command("revoke")
      .description("撤销邀请")
      .argument("<inviteId>", "邀请 ID")
      .action(async (inviteId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/invites/${inviteId}/revoke`, {}), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  for (const [name, suffix] of [
    ["show", ""],
    ["logo", "logo"],
    ["onboarding", "onboarding"],
    ["onboarding:text", "onboarding.txt"],
    ["skills:index", "skills/index"],
  ] as const) {
    addCommonClientOptions(
      invite
        .command(name)
        .description(`获取邀请${name === "show" ? "信息" : name === "logo" ? "Logo" : name === "onboarding" ? "引导信息" : name === "onboarding:text" ? "引导文本" : "技能目录"}`)
        .argument("<token>", "邀请令牌")
        .action(async (token: string, opts: BaseClientOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            const path = `${apiPath`/api/invites/${token}`}${suffix ? `/${suffix}` : ""}`;
            printOutput(await ctx.api.get(path), { json: ctx.json });
          } catch (err) {
            handleCommandError(err);
          }
      }),
    );
  }
  addCommonClientOptions(
    invite
      .command("test-resolution")
      .description("测试邀请 URL 解析")
      .argument("<token>", "邀请令牌")
      .requiredOption("--url <url>", "要测试的 URL")
      .action(async (token: string, opts: QueryOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = new URLSearchParams({ url: opts.url ?? "" });
          printOutput(await ctx.api.get(`${apiPath`/api/invites/${token}/test-resolution`}?${query.toString()}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    invite
      .command("skill")
      .description("获取邀请技能的 Markdown 内容")
      .argument("<token>", "邀请令牌")
      .argument("<skillName>", "技能名称")
      .action(async (token: string, skillName: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/invites/${token}/skills/${skillName}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    invite
      .command("accept")
      .description("接受邀请")
      .argument("<token>", "邀请令牌")
      .option("--payload-json <json>", "邀请接受操作的 JSON 请求数据", "{}")
      .action(async (token: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/invites/${token}/accept`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const join = program.command("join").description("加入申请操作");
  addCommonClientOptions(
    join
      .command("list")
      .description("列出加入申请")
      .option("-C, --company-id <id>", "公司 ID")
      .option("--status <status>", "按状态筛选（pending_approval、approved、rejected；也接受 pending 别名）")
      .option("--request-type <type>", "按请求类型筛选")
      .action(async (opts: QueryOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const params = new URLSearchParams();
          const status = normalizeJoinStatus(opts.status);
          if (status) params.set("status", status);
          if (opts.requestType) params.set("requestType", opts.requestType);
          const query = params.toString();
          printOutput(await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}/join-requests`}${query ? `?${query}` : ""}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
  addJoinAction(join, "approve");
  addJoinAction(join, "reject");
  addCommonClientOptions(
    join
      .command("claim-key")
      .description("为已批准的加入申请认领智能体 API 密钥")
      .argument("<requestId>", "加入申请 ID")
      .requiredOption("--claim-secret <secret>", "认领密钥")
      .action(async (requestId: string, opts: BaseClientOptions & { claimSecret: string }) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/join-requests/${requestId}/claim-api-key`, { claimSecret: opts.claimSecret }), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const member = program.command("member").description("公司成员操作");
  addCompanyList(member, "list", "List company members", "members");
  addCompanyList(member, "user-directory", "List company user directory", "user-directory");
  addMemberPatch(member, "update", "members");
  addMemberPatch(member, "role-and-grants", "members", "role-and-grants");
  addMemberPatch(member, "permissions", "members", "permissions");
  addMemberPost(member, "archive", "members", "archive");

  const admin = program.command("admin").description("实例管理员操作");
  const user = admin.command("user").description("管理员用户操作");
  addCommonClientOptions(
    user
      .command("list")
      .description("列出用户")
      .option("--query <text>", "搜索内容")
      .action(async (opts: QueryOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const query = opts.query ? `?${new URLSearchParams({ query: opts.query }).toString()}` : "";
          printOutput(await ctx.api.get(`/api/admin/users${query}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addAdminUserPost(user, "promote", "promote-instance-admin");
  addAdminUserPost(user, "demote", "demote-instance-admin");
  addCommonClientOptions(
    user
      .command("company-access")
      .description("获取用户的公司访问权限")
      .argument("<userId>", "用户 ID")
      .action(async (userId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/admin/users/${userId}/company-access`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    user
      .command("company-access:update")
      .description("更新用户的公司访问权限")
      .argument("<userId>", "用户 ID")
      .requiredOption("--payload-json <json>", "UpdateUserCompanyAccess JSON 请求数据")
      .action(async (userId: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.put(apiPath`/api/admin/users/${userId}/company-access`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const instance = program.command("instance").description("实例操作");
  addSimpleGet(instance, "scheduler-heartbeats", "List scheduler heartbeat agents", "/api/instance/scheduler-heartbeats");
  addSimpleGet(instance, "settings:general", "Get general instance settings", "/api/instance/settings/general");
  addJsonPatch(instance, "settings:general:update", "Update general instance settings", "/api/instance/settings/general");
  addSimpleGet(instance, "settings:experimental", "Get experimental instance settings", "/api/instance/settings/experimental");
  addJsonPatch(instance, "settings:experimental:update", "Update experimental instance settings", "/api/instance/settings/experimental");
  addCommonClientOptions(
    instance
      .command("database-backup")
      .description("创建数据库备份")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post("/api/instance/database-backups", {}), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const sidebar = program.command("sidebar").description("侧边栏偏好和徽标操作");
  addSimpleGet(sidebar, "preferences", "Get current sidebar preferences", "/api/sidebar-preferences/me");
  addJsonPut(sidebar, "preferences:update", "Update current sidebar preferences", "/api/sidebar-preferences/me");
  addCompanyList(sidebar, "project-preferences", "Get current project sidebar preferences", "sidebar-preferences/me");
  addCompanyPut(sidebar, "project-preferences:update", "Update current project sidebar preferences", "sidebar-preferences/me");
  addCompanyList(sidebar, "badges", "Get sidebar badges", "sidebar-badges");

  const inbox = program.command("inbox").description("看板收件箱操作");
  addCompanyList(inbox, "dismissals", "List dismissed inbox items", "inbox-dismissals");
  addCompanyPost(inbox, "dismiss", "Dismiss an inbox item", "inbox-dismissals");

  const boardClaim = program.command("board-claim").description("看板认领令牌操作");
  addCommonClientOptions(
    boardClaim
      .command("show")
      .description("检查看板认领令牌")
      .argument("<token>", "认领令牌")
      .action(async (token: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/board-claim/${token}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
  addCommonClientOptions(
    boardClaim
      .command("claim")
      .description("认领看板认领令牌")
      .argument("<token>", "认领令牌")
      .option("--payload-json <json>", "认领 JSON 请求数据", "{}")
      .action(async (token: string, opts: JsonPayloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(apiPath`/api/board-claim/${token}/claim`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const openclaw = program.command("openclaw").description("OpenClaw 集成辅助工具");
  addCompanyPost(openclaw, "invite-prompt", "Create an OpenClaw invite prompt", "openclaw/invite-prompt");

  const publicSkills = program.command("available-skill").description("公开技能目录操作");
  addSimpleGet(publicSkills, "list", "List available skills", "/api/skills/available");
  addSimpleGet(publicSkills, "index", "Get available skill index", "/api/skills/index");
  addCommonClientOptions(
    publicSkills
      .command("get")
      .description("获取可用技能的 Markdown 内容")
      .argument("<skillName>", "技能名称")
      .action(async (skillName: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/skills/${skillName}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  const llm = program.command("llm").description("LLM 提示词文档");
  addSimpleGet(llm, "agent-configuration", "Get agent configuration prompt docs", "/api/llms/agent-configuration.txt");
  addSimpleGet(llm, "agent-icons", "Get agent icon prompt docs", "/api/llms/agent-icons.txt");
  addCommonClientOptions(
    llm
      .command("agent-configuration:adapter")
      .description("获取适配器专用的智能体配置提示文档")
      .argument("<adapterType>", "适配器类型")
      .action(async (adapterType: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(`${apiPath`/api/llms/agent-configuration/${adapterType}`}.txt`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addWhoamiCommand(parent: Command): void {
  addCommonClientOptions(
    parent
      .command("whoami")
      .description("显示当前 CLI 身份验证身份")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/cli-auth/me"), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function normalizeJoinStatus(status: string | undefined): string | undefined {
  if (status === "pending") return "pending_approval";
  return status;
}

function addSimpleGet(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(parent.command(name).description(description).action(async (opts: BaseClientOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.get(path), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function addJsonPatch(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(parent.command(name).description(description).requiredOption("--payload-json <json>", "JSON 请求数据").action(async (opts: JsonPayloadOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.patch(path, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function addJsonPut(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(parent.command(name).description(description).requiredOption("--payload-json <json>", "JSON 请求数据").action(async (opts: JsonPayloadOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.put(path, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function addCompanyList(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).option("-C, --company-id <id>", "公司 ID").action(async (opts: CompanyOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addCompanyPut(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).option("-C, --company-id <id>", "公司 ID").requiredOption("--payload-json <json>", "JSON 请求数据").action(async (opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.put(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addCompanyPost(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).option("-C, --company-id <id>", "公司 ID").requiredOption("--payload-json <json>", "JSON 请求数据").action(async (opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}`}/${path}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addJoinAction(parent: Command, action: "approve" | "reject"): void {
  addCommonClientOptions(
    parent.command(action).description(`${action === "approve" ? "批准" : "拒绝"}加入申请`).argument("<requestId>", "加入申请 ID").option("-C, --company-id <id>", "公司 ID").action(async (requestId: string, opts: CompanyOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}/join-requests/${requestId}`}/${action}`, {}), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addMemberPatch(parent: Command, name: string, path: string, suffix?: string): void {
  addCommonClientOptions(
    parent.command(name).description(`${name === "update" ? "更新" : name === "permissions" ? "更新权限" : "更新角色与授权"}公司成员`).argument("<memberId>", "成员 ID").option("-C, --company-id <id>", "公司 ID").requiredOption("--payload-json <json>", "JSON 请求数据").action(async (memberId: string, opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        const route = `${apiPath`/api/companies/${ctx.companyId}`}/${path}/${encodeURIComponent(memberId)}${suffix ? `/${suffix}` : ""}`;
        printOutput(await ctx.api.patch(route, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addMemberPost(parent: Command, name: string, path: string, suffix: string): void {
  addCommonClientOptions(
    parent.command(name).description("归档公司成员").argument("<memberId>", "成员 ID").option("-C, --company-id <id>", "公司 ID").option("--payload-json <json>", "JSON 请求数据", "{}").action(async (memberId: string, opts: JsonPayloadOptions) => {
      try {
        const ctx = resolveCommandContext(opts, { requireCompany: true });
        printOutput(await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}`}/${path}/${encodeURIComponent(memberId)}/${suffix}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
    { includeCompany: false },
  );
}

function addAdminUserPost(parent: Command, name: string, suffix: string): void {
  addCommonClientOptions(parent.command(name).description(`${name === "promote" ? "授予" : "撤销"}实例管理员身份`).argument("<userId>", "用户 ID").action(async (userId: string, opts: BaseClientOptions) => {
    try {
      const ctx = resolveCommandContext(opts);
      printOutput(await ctx.api.post(`${apiPath`/api/admin/users/${userId}`}/${suffix}`, {}), { json: ctx.json });
    } catch (err) {
      handleCommandError(err);
    }
  }));
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
