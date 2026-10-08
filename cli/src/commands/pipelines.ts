import { readFile } from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
import { ApiRequestError } from "../client/http.js";
import {
  addCommonClientOptions,
  apiPath,
  formatInlineRecord,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
  type ResolvedClientContext,
} from "./client/common.js";

type JsonObject = Record<string, unknown>;

type PipelineStage = {
  id: string;
  key: string;
  name: string;
  kind: string;
  position: number;
  config?: JsonObject;
};

type PipelineSummary = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  enforceTransitions?: boolean;
  stageCount?: number;
  openCaseCount?: number;
};

type PipelineDetail = PipelineSummary & {
  stages?: PipelineStage[];
  transitions?: Array<{ fromStageId: string; toStageId: string; label?: string | null }>;
  documentKeys?: Array<{ key: string; documentId: string }>;
};

type PipelineCase = {
  id: string;
  caseKey: string;
  title: string;
  summary?: string | null;
  pipelineId: string;
  stageId: string;
  version: number;
  terminalKind?: string | null;
  childCount?: number;
  terminalChildCount?: number;
  pendingSuggestion?: JsonObject | null;
};

type CaseListRow = {
  case: PipelineCase;
  stage: PipelineStage;
};

type CaseDetail = CaseListRow & {
  pipeline: PipelineSummary;
  allowedNextStages?: PipelineStage[];
  blockers?: unknown[];
  blocks?: unknown[];
  links?: unknown[];
  childrenSummary?: JsonObject;
  pendingSuggestion?: JsonObject | null;
};

interface PipelineOptions extends BaseClientOptions {
  companyId?: string;
}

interface CreateOptions extends PipelineOptions {
  key: string;
  name: string;
  description?: string;
  projectId?: string;
  enforceTransitions?: boolean;
  stagesJson?: string;
  stagesFile?: string;
}

interface TransitionSetOptions extends PipelineOptions {
  file: string;
  enforce?: boolean;
}

interface GuidancePutOptions extends PipelineOptions {
  file?: string;
  body?: string;
  title?: string;
}

interface AutomationOptions extends PipelineOptions {
  stage: string;
  routine: string;
  note?: string;
}

interface IngestOptions extends PipelineOptions {
  caseKey?: string;
  title: string;
  summary?: string;
  fieldsJson?: string;
  fieldsFile?: string;
  stage?: string;
  parentCase?: string;
  workspaceRefJson?: string;
  blockedBy?: string;
  blockedByKey?: string;
}

interface IngestBatchOptions extends PipelineOptions {
  file: string;
}

interface CasesOptions extends PipelineOptions {
  stage?: string;
  parent?: string;
  terminal?: boolean;
  q?: string;
}

interface EditOptions extends PipelineOptions {
  expectedVersion?: string;
  title?: string;
  summary?: string;
  fieldsJson?: string;
  fieldsFile?: string;
  workspaceRefJson?: string;
  parentCase?: string;
  leaseToken?: string;
}

interface ClaimOptions extends PipelineOptions {
  leaseSeconds?: string;
}

interface ReleaseOptions extends PipelineOptions {
  leaseToken?: string;
  force?: boolean;
}

interface CaseTransitionOptions extends PipelineOptions {
  to: string;
  expectedVersion: string;
  reason?: string;
  leaseToken?: string;
  acceptSuggestion?: string;
}

interface SuggestOptions extends PipelineOptions {
  to: string;
  rationale: string;
  confidence?: string;
}

interface ResolveSuggestionOptions extends PipelineOptions {
  suggestion: string;
  accept?: boolean;
  dismiss?: boolean;
  expectedVersion?: string;
  reason?: string;
  leaseToken?: string;
}

interface ReviewOptions extends PipelineOptions {
  approve?: boolean;
  reject?: boolean;
  requestChanges?: boolean;
  reason?: string;
  expectedVersion: string;
  editsJson?: string;
  editsFile?: string;
  title?: string;
  summary?: string;
  fieldsJson?: string;
  fieldsFile?: string;
  leaseToken?: string;
}

interface BlockOptions extends PipelineOptions {
  by: string;
}

interface ReviewInboxOptions extends PipelineOptions {
  pipeline?: string;
  parent?: string;
}

interface ReviewBulkOptions extends PipelineOptions {
  file: string;
}

export function registerPipelineCommands(program: Command): void {
  const pipelines = program.command("pipelines").description("流水线与案件操作");

  addPipelineOptions(
    pipelines
      .command("create")
      .description("创建流水线")
      .requiredOption("--key <key>", "流水线键")
      .requiredOption("--name <name>", "流水线名称")
      .option("--description <text>", "流水线说明")
      .option("--project-id <id>", "项目 ID")
      .option("--enforce-transitions", "仅允许已配置的流转")
      .option("--stages-json <json>", "JSON 格式的流水线阶段数组")
      .option("--stages-file <path>", "从 JSON 文件读取流水线阶段数组")
      .action((opts: CreateOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body: JsonObject = {
          key: opts.key,
          name: opts.name,
        };
        setIfDefined(body, "description", opts.description);
        setIfDefined(body, "projectId", opts.projectId);
        setIfDefined(body, "enforceTransitions", opts.enforceTransitions);
        const stages = await readJsonFromOptions(opts.stagesJson, opts.stagesFile);
        if (stages !== undefined) body.stages = stages;
        printPipeline(await ctx.api.post<PipelineDetail>(apiPath`/api/companies/${ctx.companyId}/pipelines`, body), ctx);
      })),
  );

  addPipelineOptions(
    pipelines
      .command("list")
      .description("列出流水线")
      .action((opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const rows = await ctx.api.get<PipelineSummary[]>(apiPath`/api/companies/${ctx.companyId}/pipelines`) ?? [];
        if (ctx.json) return printOutput(rows, { json: true });
        if (rows.length === 0) return printOutput([]);
        rows.forEach((row) => console.log(formatPipeline(row)));
      })),
  );

  addPipelineOptions(
    pipelines
      .command("get")
      .description("按 ID 或键获取流水线")
      .argument("<pipeline>", "流水线 ID 或键")
      .action((pipeline: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printPipeline(await getPipeline(ctx, pipeline), ctx);
      })),
  );

  addPipelineOptions(
    pipelines
      .command("set-transitions")
      .description("替换流水线流转边集合")
      .argument("<pipeline>", "流水线 ID 或键")
      .requiredOption("--file <path>", "包含流转数组或 { transitions } 对象的 JSON 文件")
      .option("--enforce", "启用流转限制")
      .action((pipeline: string, opts: TransitionSetOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const input = await readJsonFile(opts.file);
        const body = Array.isArray(input) ? { transitions: input } : asObject(input);
        if (opts.enforce !== undefined) body.enforceTransitions = true;
        printOutput(await ctx.api.put(apiPath`/api/pipelines/${pipelineId}/transitions`, body), { json: ctx.json });
      })),
  );

  const guidance = pipelines.command("guidance").description("流水线指导文档操作");
  addPipelineOptions(
    guidance
      .command("get")
      .description("获取流水线指导文档")
      .argument("<pipeline>", "流水线 ID 或键")
      .action((pipeline: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const result = await ctx.api.get(apiPath`/api/pipelines/${pipelineId}/documents/guidance`);
        printOutput(result, { json: ctx.json });
      })),
  );
  addPipelineOptions(
    guidance
      .command("put")
      .description("创建或替换流水线指导文档")
      .argument("<pipeline>", "流水线 ID 或键")
      .option("--file <path>", "Markdown 文件")
      .option("--body <markdown>", "Markdown 正文")
      .option("--title <title>", "文档标题")
      .action((pipeline: string, opts: GuidancePutOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const body = opts.body ?? (opts.file ? await readFile(opts.file, "utf8") : undefined);
        if (body === undefined) throw new Error("必须提供指导文档正文。请传入 --file 或 --body。");
        printOutput(await ctx.api.put(apiPath`/api/pipelines/${pipelineId}/documents/guidance`, {
          title: opts.title ?? "Pipeline guidance",
          body,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("set-automation")
      .description("为阶段设置 run_routine onEnter 自动化")
      .argument("<pipeline>", "流水线 ID 或键")
      .requiredOption("--stage <key>", "阶段键")
      .requiredOption("--routine <id>", "例程 ID")
      .option("--note <text>", "自动化备注")
      .action((pipeline: string, opts: AutomationOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const detail = await getPipeline(ctx, pipeline);
        const stage = detail.stages?.find((item) => item.key === opts.stage);
        if (!stage) throw new Error(`在流水线 ${detail.key} 中未找到阶段：${opts.stage}`);
        const config = {
          ...(stage.config ?? {}),
          onEnter: {
            ...(asOptionalObject(stage.config?.onEnter) ?? {}),
            type: "run_routine",
            routineId: opts.routine,
            ...(opts.note ? { note: opts.note } : {}),
          },
        };
        printOutput(await ctx.api.patch(apiPath`/api/pipelines/${detail.id}/stages/${stage.id}`, { config }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("ingest")
      .description("向流水线导入单个案件")
      .argument("<pipeline>", "流水线 ID 或键")
      .option("--case-key <key>", "案件幂等键")
      .requiredOption("--title <title>", "案件标题")
      .option("--summary <text>", "案件摘要")
      .option("--fields-json <json>", "案件字段 JSON 对象")
      .option("--fields-file <path>", "从文件读取案件字段 JSON 对象")
      .option("--stage <key>", "初始阶段键")
      .option("--parent-case <id>", "父案件 ID")
      .option("--workspace-ref-json <json>", "工作区引用 JSON 对象")
      .option("--blocked-by <csv>", "阻塞案件 ID，以逗号分隔")
      .option("--blocked-by-key <csv>", "阻塞案件键，以逗号分隔")
      .action((pipeline: string, opts: IngestOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const body = await buildIngestBody(opts);
        printOutput(await ctx.api.post(apiPath`/api/pipelines/${pipelineId}/cases`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("ingest-batch")
      .description("批量导入案件")
      .argument("<pipeline>", "流水线 ID 或键")
      .requiredOption("--file <path>", "包含数组或 { items } 对象的 JSON 文件")
      .action((pipeline: string, opts: IngestBatchOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const input = await readJsonFile(opts.file);
        const body = Array.isArray(input) ? { items: input } : asObject(input);
        printOutput(await ctx.api.post(apiPath`/api/pipelines/${pipelineId}/cases/batch`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    pipelines
      .command("cases")
      .description("列出流水线中的案件")
      .argument("<pipeline>", "流水线 ID 或键")
      .option("--stage <key>", "按阶段键筛选")
      .option("--parent <caseId>", "按父案件 ID 筛选")
      .option("--terminal", "仅显示终态案件")
      .option("--q <text>", "搜索标题/摘要")
      .action((pipeline: string, opts: CasesOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const pipelineId = await resolvePipelineId(ctx, pipeline);
        const params = new URLSearchParams();
        if (opts.stage) params.set("stageKey", opts.stage);
        if (opts.parent) params.set("parentCaseId", opts.parent);
        if (opts.terminal) params.set("terminal", "true");
        if (opts.q) params.set("q", opts.q);
        const query = params.toString();
        const rows = await ctx.api.get<CaseListRow[]>(`${apiPath`/api/pipelines/${pipelineId}/cases`}${query ? `?${query}` : ""}`) ?? [];
        printCases(rows, ctx);
      })),
  );

  const caseCommand = pipelines.command("case").description("流水线案件操作");
  registerCaseCommands(caseCommand);

  addPipelineOptions(
    pipelines
      .command("review-inbox")
      .description("列出等待审查的案件")
      .option("--pipeline <idOrKey>", "筛选单条流水线")
      .option("--parent <caseId>", "按父案件 ID 筛选")
      .action((opts: ReviewInboxOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const params = new URLSearchParams();
        if (opts.pipeline) params.set("pipelineId", await resolvePipelineId(ctx, opts.pipeline));
        if (opts.parent) params.set("parentCaseId", opts.parent);
        const query = params.toString();
        const rows = await ctx.api.get<CaseListRow[]>(`${apiPath`/api/companies/${ctx.companyId}/review-cases`}${query ? `?${query}` : ""}`) ?? [];
        printCases(rows, ctx);
      })),
  );

  addPipelineOptions(
    pipelines
      .command("review-bulk")
      .description("批量应用审查决定：approve、reject 或 request_changes")
      .requiredOption("--file <path>", "包含数组或 { items } 对象的 JSON 文件")
      .action((opts: ReviewBulkOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const input = await readJsonFile(opts.file);
        const body = Array.isArray(input) ? { items: input } : asObject(input);
        printOutput(await ctx.api.post(apiPath`/api/companies/${ctx.companyId}/review-cases/bulk`, body), { json: ctx.json });
      })),
  );
}

function registerCaseCommands(caseCommand: Command): void {
  addPipelineOptions(
    caseCommand
      .command("get")
      .description("获取案件")
      .argument("<caseId>", "案件 ID")
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printCaseDetail(await ctx.api.get<CaseDetail>(apiPath`/api/cases/${caseId}`), ctx);
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("events")
      .description("列出案件事件")
      .argument("<caseId>", "案件 ID")
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.get(apiPath`/api/cases/${caseId}/events`), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("rollup")
      .description("获取案件递归汇总")
      .argument("<caseId>", "案件 ID")
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.get(apiPath`/api/cases/${caseId}/rollup`), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("edit")
      .description("编辑案件内容")
      .argument("<caseId>", "案件 ID")
      .option("--expected-version <n>", "预期案件版本")
      .option("--title <title>", "新标题")
      .option("--summary <text>", "新摘要")
      .option("--fields-json <json>", "替换字段的 JSON 对象")
      .option("--fields-file <path>", "从 JSON 文件读取替换字段")
      .option("--workspace-ref-json <json>", "工作区引用 JSON 对象")
      .option("--parent-case <id>", "父案件 ID")
      .option("--lease-token <token>", "租约令牌")
      .action((caseId: string, opts: EditOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body: JsonObject = {};
        setIfDefined(body, "title", opts.title);
        setIfDefined(body, "summary", opts.summary);
        setIfDefined(body, "parentCaseId", opts.parentCase);
        setIfDefined(body, "leaseToken", opts.leaseToken);
        if (opts.expectedVersion) body.expectedVersion = parsePositiveInt(opts.expectedVersion, "expected version");
        const fields = await readJsonFromOptions(opts.fieldsJson, opts.fieldsFile);
        if (fields !== undefined) body.fields = fields;
        if (opts.workspaceRefJson) body.workspaceRef = parseJson(opts.workspaceRefJson);
        printOutput(await ctx.api.patch(apiPath`/api/cases/${caseId}`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("claim")
      .description("认领案件租约")
      .argument("<caseId>", "案件 ID")
      .option("--lease-seconds <n>", "租约时长（秒）")
      .action((caseId: string, opts: ClaimOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body = opts.leaseSeconds ? { leaseSeconds: parsePositiveInt(opts.leaseSeconds, "lease seconds") } : {};
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/claim`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("release")
      .description("释放案件租约")
      .argument("<caseId>", "案件 ID")
      .option("--lease-token <token>", "租约令牌")
      .option("--force", "以看板/用户身份强制释放")
      .action((caseId: string, opts: ReleaseOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/release`, {
          leaseToken: opts.leaseToken,
          force: opts.force,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("transition")
      .description("将案件流转到其他阶段")
      .argument("<caseId>", "案件 ID")
      .requiredOption("--to <stageKey>", "目标阶段键")
      .requiredOption("--expected-version <n>", "预期案件版本")
      .option("--reason <text>", "流转原因")
      .option("--lease-token <token>", "租约令牌")
      .option("--accept-suggestion <id>", "已接受的建议 ID")
      .action((caseId: string, opts: CaseTransitionOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/transition`, {
          toStageKey: opts.to,
          expectedVersion: parsePositiveInt(opts.expectedVersion, "expected version"),
          reason: opts.reason,
          leaseToken: opts.leaseToken,
          acceptSuggestionId: opts.acceptSuggestion,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("suggest")
      .description("建议流转，但不移动案件")
      .argument("<caseId>", "案件 ID")
      .requiredOption("--to <stageKey>", "目标阶段键")
      .requiredOption("--rationale <text>", "建议理由")
      .option("--confidence <n>", "置信度，范围 0..1")
      .action((caseId: string, opts: SuggestOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const body: JsonObject = {
          toStageKey: opts.to,
          rationale: opts.rationale,
        };
        if (opts.confidence) body.confidence = Number(opts.confidence);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/suggest-transition`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("resolve-suggestion")
      .description("接受或忽略待处理的流转建议")
      .argument("<caseId>", "案件 ID")
      .requiredOption("--suggestion <id>", "建议 ID")
      .option("--accept", "接受建议")
      .option("--dismiss", "忽略建议")
      .option("--expected-version <n>", "预期案件版本")
      .option("--reason <text>", "决策原因")
      .option("--lease-token <token>", "租约令牌")
      .action((caseId: string, opts: ResolveSuggestionOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const decision = exactlyOneFlag(opts.accept, opts.dismiss, "--accept", "--dismiss") === "--accept" ? "accept" : "dismiss";
        const body: JsonObject = {
          suggestionId: opts.suggestion,
          resolution: decision,
          reason: opts.reason,
          leaseToken: opts.leaseToken,
        };
        if (opts.expectedVersion) body.expectedVersion = parsePositiveInt(opts.expectedVersion, "expected version");
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/resolve-suggestion`, body), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("review")
      .description("批准、拒绝或要求修改处于审查阶段的案件")
      .argument("<caseId>", "案件 ID")
      .option("--approve", "批准案件")
      .option("--reject", "拒绝案件")
      .option("--request-changes", "要求修改案件")
      .option("--reason <text>", "决策原因")
      .requiredOption("--expected-version <n>", "预期案件版本")
      .option("--edits-json <json>", "审查修改内容的 JSON")
      .option("--edits-file <path>", "从文件读取审查修改 JSON")
      .option("--title <title>", "决策前修改标题")
      .option("--summary <text>", "决策前修改摘要")
      .option("--fields-json <json>", "决策前修改字段")
      .option("--fields-file <path>", "从 JSON 文件读取修改字段")
      .option("--lease-token <token>", "租约令牌")
      .action((caseId: string, opts: ReviewOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        const decision = reviewDecisionFromOptions(opts);
        const edits = await buildReviewEdits(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/review`, {
          decision,
          reason: opts.reason,
          edits,
          expectedVersion: parsePositiveInt(opts.expectedVersion, "expected version"),
          leaseToken: opts.leaseToken,
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("block")
      .description("替换案件阻塞项集合")
      .argument("<caseId>", "案件 ID")
      .requiredOption("--by <csv>", "逗号分隔的阻塞案件 ID；传入空字符串以清除")
      .action((caseId: string, opts: BlockOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.put(apiPath`/api/cases/${caseId}/blockers`, {
          blockedByCaseIds: parseCsv(opts.by),
        }), { json: ctx.json });
      })),
  );

  addPipelineOptions(
    caseCommand
      .command("open-conversation")
      .description("打开或返回案件对话任务")
      .argument("<caseId>", "案件 ID")
      .action((caseId: string, opts: PipelineOptions) => withPipelineErrors(async () => {
        const ctx = resolvePipelineContext(opts);
        printOutput(await ctx.api.post(apiPath`/api/cases/${caseId}/open-conversation`, {}), { json: ctx.json });
      })),
  );
}

function addPipelineOptions(command: Command): Command {
  return addCommonClientOptions(command, { includeCompany: true });
}

function resolvePipelineContext(opts: PipelineOptions): ResolvedClientContext & { companyId: string } {
  return resolveCommandContext(opts, { requireCompany: true }) as ResolvedClientContext & { companyId: string };
}

async function resolvePipelineId(ctx: ResolvedClientContext & { companyId: string }, pipeline: string): Promise<string> {
  if (looksLikeUuid(pipeline)) return pipeline;
  const rows = await ctx.api.get<PipelineSummary[]>(apiPath`/api/companies/${ctx.companyId}/pipelines`) ?? [];
  const match = rows.find((row) => row.key === pipeline || row.id === pipeline);
  if (!match) throw new Error(`未找到键或 ID 为 ${pipeline} 的流水线`);
  return match.id;
}

async function getPipeline(ctx: ResolvedClientContext & { companyId: string }, pipeline: string): Promise<PipelineDetail> {
  const pipelineId = await resolvePipelineId(ctx, pipeline);
  const detail = await ctx.api.get<PipelineDetail>(apiPath`/api/pipelines/${pipelineId}`);
  if (!detail) throw new Error(`未找到流水线：${pipeline}`);
  return detail;
}

async function buildIngestBody(opts: IngestOptions): Promise<JsonObject> {
  const body: JsonObject = { title: opts.title };
  setIfDefined(body, "caseKey", opts.caseKey);
  setIfDefined(body, "summary", opts.summary);
  setIfDefined(body, "stageKey", opts.stage);
  setIfDefined(body, "parentCaseId", opts.parentCase);
  if (opts.fieldsJson || opts.fieldsFile) body.fields = await readJsonFromOptions(opts.fieldsJson, opts.fieldsFile);
  if (opts.workspaceRefJson) body.workspaceRef = parseJson(opts.workspaceRefJson);
  if (opts.blockedBy) body.blockedByCaseIds = parseCsv(opts.blockedBy);
  if (opts.blockedByKey) body.blockedByCaseKeys = parseCsv(opts.blockedByKey);
  return body;
}

async function buildReviewEdits(opts: ReviewOptions): Promise<JsonObject | undefined> {
  const fromFile = await readJsonFromOptions(opts.editsJson, opts.editsFile);
  const edits = fromFile === undefined ? {} : asObject(fromFile);
  setIfDefined(edits, "title", opts.title);
  setIfDefined(edits, "summary", opts.summary);
  const fields = await readJsonFromOptions(opts.fieldsJson, opts.fieldsFile);
  if (fields !== undefined) edits.fields = fields;
  return Object.keys(edits).length ? edits : undefined;
}

async function readJsonFromOptions(json?: string, file?: string): Promise<unknown | undefined> {
  if (json && file) throw new Error("内联 JSON 和 JSON 文件只能使用一种。");
  if (json) return parseJson(json);
  if (file) return readJsonFile(file);
  return undefined;
}

async function readJsonFile(file: string): Promise<unknown> {
  return parseJson(await readFile(file, "utf8"));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`JSON 无效：${error instanceof Error ? error.message : String(error)}`);
  }
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("预期为 JSON 对象。");
  }
  return value as JsonObject;
}

function asOptionalObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 无效：${value}`);
  return parsed;
}

function parseCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function setIfDefined(target: JsonObject, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function exactlyOneFlag(first: boolean | undefined, second: boolean | undefined, firstName: string, secondName: string): string {
  if (Boolean(first) === Boolean(second)) throw new Error(`请在 ${firstName} 和 ${secondName} 中选择一个。`);
  return first ? firstName : secondName;
}

function reviewDecisionFromOptions(opts: ReviewOptions): "approve" | "reject" | "request_changes" {
  const selected = [
    opts.approve ? { flag: "--approve", decision: "approve" as const } : null,
    opts.reject ? { flag: "--reject", decision: "reject" as const } : null,
    opts.requestChanges ? { flag: "--request-changes", decision: "request_changes" as const } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (selected.length !== 1) {
    throw new Error("--approve、--reject 和 --request-changes 只能选择一个。");
  }
  return selected[0]!.decision;
}

function printPipeline(row: PipelineDetail | PipelineSummary | null, ctx: ResolvedClientContext): void {
  if (!row) return printOutput(null, { json: ctx.json });
  if (ctx.json) return printOutput(row, { json: true });
  console.log(formatPipeline(row));
  if ("stages" in row && row.stages?.length) {
    console.log(pc.bold("Stages"));
    row.stages.forEach((stage) => {
      console.log(`  ${formatInlineRecord({
        id: stage.id,
        key: stage.key,
        name: stage.name,
        kind: stage.kind,
        position: stage.position,
      })}`);
    });
  }
}

function formatPipeline(row: PipelineSummary): string {
  return formatInlineRecord({
    id: row.id,
    key: row.key,
    name: row.name,
    enforceTransitions: row.enforceTransitions,
    stageCount: row.stageCount,
    openCaseCount: row.openCaseCount,
  });
}

function printCases(rows: CaseListRow[], ctx: ResolvedClientContext): void {
  if (ctx.json) return printOutput(rows, { json: true });
  if (rows.length === 0) return printOutput([]);
  rows.forEach((row) => console.log(formatCase(row.case, row.stage)));
}

function printCaseDetail(detail: CaseDetail | null, ctx: ResolvedClientContext): void {
  if (!detail) return printOutput(null, { json: ctx.json });
  if (ctx.json) return printOutput(detail, { json: true });
  console.log(formatCase(detail.case, detail.stage, detail.pipeline));
  console.log(JSON.stringify({
    pendingSuggestion: detail.pendingSuggestion ?? detail.case.pendingSuggestion ?? null,
    childrenSummary: detail.childrenSummary,
    blockers: detail.blockers,
    blocks: detail.blocks,
    links: detail.links,
  }, null, 2));
}

function formatCase(row: PipelineCase, stage: PipelineStage, pipeline?: PipelineSummary): string {
  return formatInlineRecord({
    id: row.id,
    caseKey: row.caseKey,
    title: row.title,
    pipeline: pipeline?.key,
    stage: stage.key,
    stageKind: stage.kind,
    version: row.version,
    terminalKind: row.terminalKind,
    children: row.childCount === undefined ? undefined : `${row.terminalChildCount ?? 0}/${row.childCount}`,
  });
}

async function withPipelineErrors(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    handlePipelineError(error);
  }
}

function handlePipelineError(error: unknown): never {
  if (error instanceof ApiRequestError) {
    const body = asOptionalObject(error.body);
    const details = asOptionalObject(error.details);
    const code = stringValue(details?.code) ?? stringValue(body?.code);
    const stage = details?.stage ?? details?.currentStage ?? details?.currentStageKey ?? details?.stageKey;
    const version = details?.version ?? details?.currentVersion;
    const parts = [`API error ${error.status}: ${error.message}`];
    if (code) parts.push(`code=${code}`);
    if (version !== undefined) parts.push(`currentVersion=${String(version)}`);
    if (stage !== undefined) parts.push(`currentStage=${formatStageForError(stage)}`);
    console.error(pc.red(parts.join(" ")));
    if (error.status === 409) {
      console.error(pc.yellow("恢复方法：使用 `paperclipai pipelines case get <case-id> --json` 重新读取案件，然后使用当前版本/阶段重试。"));
    }
    if (error.details !== undefined && !code) console.error(pc.dim(`details=${JSON.stringify(error.details)}`));
    process.exit(1);
  }
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function formatStageForError(stage: unknown): string {
  if (typeof stage === "string") return stage;
  if (stage && typeof stage === "object" && "key" in stage) return String((stage as { key: unknown }).key);
  return JSON.stringify(stage);
}
