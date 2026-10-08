import { Command } from "commander";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface AdapterOptions extends BaseClientOptions {
  companyId?: string;
  payloadJson?: string;
  refresh?: boolean;
  environmentId?: string;
}

export function registerAdapterCommands(program: Command): void {
  const adapter = program.command("adapter").description("适配器管理操作");

  addCommonClientOptions(
    adapter
      .command("list")
      .description("列出已注册的适配器")
      .action(async (opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get("/api/adapters"), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addJsonPost(adapter, "install", "Install an external adapter", "/api/adapters/install");

  addCommonClientOptions(
    adapter
      .command("get")
      .description("获取适配器详情")
      .argument("<type>", "适配器类型")
      .action(async (type: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/adapters/${type}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addAdapterPatch(adapter, "update", "Update adapter settings", "");
  addAdapterPatch(adapter, "override", "Pause or resume a built-in adapter override", "/override");
  addAdapterPost(adapter, "reload", "Reload an adapter", "/reload");
  addAdapterPost(adapter, "reinstall", "Reinstall an adapter", "/reinstall");

  addCommonClientOptions(
    adapter
      .command("delete")
      .description("删除外部适配器注册项")
      .argument("<type>", "适配器类型")
      .action(async (type: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.delete(apiPath`/api/adapters/${type}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    adapter
      .command("config-schema")
      .description("获取适配器配置架构")
      .argument("<type>", "适配器类型")
      .action(async (type: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/adapters/${type}/config-schema`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    adapter
      .command("ui-parser")
      .description("获取适配器界面解析器 JavaScript")
      .argument("<type>", "适配器类型")
      .action(async (type: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get(apiPath`/api/adapters/${type}/ui-parser.js`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    adapter
      .command("models")
      .description("列出公司的适配器模型")
      .argument("<type>", "适配器类型")
      .option("-C, --company-id <id>", "公司 ID")
      .option("--refresh", "刷新提供方模型列表", false)
      .option("--environment-id <id>", "支持环境配置的适配器所用的环境 ID")
      .action(async (type: string, opts: AdapterOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const query = new URLSearchParams();
          if (opts.refresh) query.set("refresh", "true");
          if (opts.environmentId?.trim()) query.set("environmentId", opts.environmentId.trim());
          const suffix = query.size > 0 ? `?${query.toString()}` : "";
          printOutput(await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}/adapters/${type}/models`}${suffix}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCompanyAdapterGet(adapter, "detect-model", "Detect adapter model", "detect-model");
  addCompanyAdapterPost(adapter, "test-environment", "Test adapter environment configuration", "test-environment");
}

function addJsonPost(parent: Command, name: string, description: string, path: string): void {
  addCommonClientOptions(
    parent.command(name).description(description).requiredOption("--payload-json <json>", "JSON 请求数据").action(async (opts: AdapterOptions) => {
      try {
        const ctx = resolveCommandContext(opts);
        printOutput(await ctx.api.post(path, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
      } catch (err) {
        handleCommandError(err);
      }
    }),
  );
}

function addAdapterPatch(parent: Command, name: string, description: string, suffix: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<type>", "适配器类型")
      .requiredOption("--payload-json <json>", "JSON 请求数据")
      .action(async (type: string, opts: AdapterOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.patch(`${apiPath`/api/adapters/${type}`}${suffix}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addAdapterPost(parent: Command, name: string, description: string, suffix: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<type>", "适配器类型")
      .option("--payload-json <json>", "JSON 请求数据", "{}")
      .action(async (type: string, opts: AdapterOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.post(`${apiPath`/api/adapters/${type}`}${suffix}`, parseJson(opts.payloadJson ?? "{}")), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addCompanyAdapterGet(parent: Command, name: string, description: string, suffix: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<type>", "适配器类型")
      .option("-C, --company-id <id>", "公司 ID")
      .action(async (type: string, opts: AdapterOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          printOutput(await ctx.api.get(`${apiPath`/api/companies/${ctx.companyId}/adapters/${type}`}/${suffix}`), { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function addCompanyAdapterPost(parent: Command, name: string, description: string, suffix: string): void {
  addCommonClientOptions(
    parent
      .command(name)
      .description(description)
      .argument("<type>", "适配器类型")
      .option("-C, --company-id <id>", "公司 ID")
      .option("--payload-json <json>", "JSON 请求数据", "{}")
      .action(async (type: string, opts: AdapterOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          printOutput(
            await ctx.api.post(`${apiPath`/api/companies/${ctx.companyId}/adapters/${type}`}/${suffix}`, parseJson(opts.payloadJson ?? "{}")),
            { json: ctx.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
