---
title: 创建适配器
summary: 自定义适配器构建指南
---

构建自定义适配器，将 Paperclip 连接到任意 agent runtime。

<Tip>
如果你使用 Claude Code，`.agents/skills/create-agent-adapter` 技能可以交互式地指导你完成适配器创建流程。只需让 Claude 创建一个新适配器，它就会逐步引导你完成。
</Tip>

## 两种方式

| | 内置 | 外部插件 |
|---|---|---|
| 源码 | 位于 `paperclip-fork` 内 | 独立 npm 包 |
| 分发 | 随 Paperclip 一起发布 | 独立发布到 npm |
| UI 解析器 | 静态导入 | 从 API 动态加载 |
| 注册 | 编辑 3 个注册表 | 启动时自动加载 |
| 适用场景 | 核心适配器、贡献者 | 第三方适配器、内部工具 |

大多数情况下，**建议构建外部适配器插件**。这种方式更简洁，可独立管理版本，也无需修改 Paperclip 源码。完整指南请参阅[外部适配器](/adapters/external-adapters)。

本页其余内容介绍两种方式共用的内部机制。

## 软件包结构

```
packages/adapters/<name>/    # built-in
  ── or ──
my-adapter/                   # external plugin
  package.json
  tsconfig.json
  src/
    index.ts            # Shared metadata
    server/
      index.ts          # Server exports (createServerAdapter)
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui/
      index.ts          # UI exports (built-in only)
      parse-stdout.ts   # Transcript parser (built-in only)
      build-config.ts   # Config builder
    ui-parser.ts        # Self-contained UI parser (external — see [UI Parser Contract](/adapters/adapter-ui-parser))
    cli/
      index.ts          # CLI exports
      format-event.ts   # Terminal formatter
```

## 第 1 步：根级元数据

三个使用方都会导入 `src/index.ts`。请确保该文件不依赖其他模块。

```ts
export const type = "my_agent";        // snake_case, globally unique
export const label = "My Agent";
export const models = [
  { id: "model-a", label: "Model A" },
];
export const agentConfigurationDoc = `# my_agent configuration
Use when: ...
Don't use when: ...
Core fields: ...
`;

// Required for external adapters (plugin-loader convention)
export { createServerAdapter } from "./server/index.js";
```

## 第 2 步：服务端执行

`src/server/execute.ts` 是核心模块。它接收 `AdapterExecutionContext` 并返回 `AdapterExecutionResult`。

主要职责：

1. 使用 `@paperclipai/adapter-utils/server-utils` 中的安全辅助函数（`asString`、`asNumber` 等）读取配置
2. 使用 `buildPaperclipEnv(agent)` 构建环境，并加入上下文变量
3. 从 `runtime.sessionParams` 解析会话状态
4. 使用 `renderTemplate(template, data)` 渲染提示词
5. 使用 `runChildProcess()` 启动进程，或通过 `fetch()` 发起调用
6. 解析输出中的用量、费用、会话状态和错误
7. 处理未知会话错误（重新发起请求，并设置 `clearSession: true`）

### 可用的辅助函数

| 辅助函数 | 来源 | 用途 |
|--------|--------|---------|
| `runChildProcess(cmd, opts)` | `@paperclipai/adapter-utils/server-utils` | 启动进程并支持超时、宽限期和流式输出 |
| `buildPaperclipEnv(agent)` | `@paperclipai/adapter-utils/server-utils` | 注入 `PAPERCLIP_*` 环境变量 |
| `renderTemplate(tpl, data)` | `@paperclipai/adapter-utils/server-utils` | 替换 `{{variable}}` 变量 |
| `asString(v)` | `@paperclipai/adapter-utils` | 安全地提取配置字符串 |
| `asNumber(v)` | `@paperclipai/adapter-utils` | 安全地提取数字 |

### AdapterExecutionContext

```ts
interface AdapterExecutionContext {
  runId: string;
  agent: { id: string; companyId: string; name: string; adapterConfig: unknown };
  runtime: { sessionId: string | null; sessionParams: Record<string, unknown> | null };
  config: Record<string, unknown>;      // agent's adapterConfig
  context: Record<string, unknown>;      // task, wake reason, etc.
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  onSpawn?: (meta: { pid: number; startedAt: string }) => Promise<void>;
}
```

### AdapterExecutionResult

```ts
interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  usage?: { inputTokens: number; outputTokens: number };
  sessionParams?: Record<string, unknown> | null;  // persist across heartbeats
  sessionDisplayId?: string | null;
  provider?: string | null;
  model?: string | null;
  costUsd?: number | null;
  clearSession?: boolean;  // set true to force fresh session on next wake
}
```

## 第 3 步：环境测试

`src/server/test.ts` 会在运行前验证适配器配置。

返回结构化诊断信息：

| 级别 | 含义 | 影响 |
|-------|---------|--------|
| `error` | 配置无效或不可用 | 阻止执行 |
| `warn` | 非阻断问题 | 以黄色标记显示 |
| `info` | 检查成功 | 显示在测试结果中 |

```ts
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  return {
    adapterType: ctx.adapterType,
    status: "pass",  // "pass" | "warn" | "fail"
    checks: [
      { level: "info", message: "CLI v1.2.0 detected", code: "cli_detected" },
      { level: "warn", message: "No API key found", hint: "Set ANTHROPIC_API_KEY", code: "no_key" },
    ],
    testedAt: new Date().toISOString(),
  };
}
```

## 第 4 步：UI 模块（仅内置适配器）

对于注册在 Paperclip 源码中的内置适配器：

- `parse-stdout.ts` — 将 stdout 行转换为 `TranscriptEntry[]`，供运行记录查看器使用
- `build-config.ts` — 将表单值转换为 `adapterConfig` JSON
- 配置字段 React 组件位于 `ui/src/adapters/<name>/config-fields.tsx`

外部适配器则使用独立的 `ui-parser.ts`。请参阅 [UI 解析器契约](/adapters/adapter-ui-parser)。

## 第 5 步：CLI 模块

`format-event.ts` — 使用 `picocolors` 美化 `paperclipai run --watch` 的 stdout 输出。

```ts
export function formatStdoutEvent(line: string, debug: boolean): void {
  if (line.startsWith("[tool-done]")) {
    console.log(chalk.green(`  ✓ ${line}`));
  } else {
    console.log(`  ${line}`);
  }
}
```

## 第 6 步：注册（仅内置适配器）

将适配器添加到以下三个注册表：

1. `server/src/adapters/registry.ts`
2. `ui/src/adapters/registry.ts`
3. `cli/src/adapters/registry.ts`

外部适配器会由插件加载器自动注册。

## 会话持久化

如果 agent runtime 支持在多个 heartbeat 之间延续对话：

1. 从 `execute()` 返回 `sessionParams`（例如 `{ sessionId: "abc123" }`）
2. 下次唤醒时读取 `runtime.sessionParams`，以恢复会话
3. 可以选择实现 `sessionCodec`，用于验证和显示

```ts
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) { /* validate raw session data */ },
  serialize(params) { /* serialize for storage */ },
  getDisplayId(params) { /* human-readable session label */ },
};
```

## 能力标记

适配器可以通过设置 `ServerAdapterModule` 上的可选字段，声明其支持哪些“本地”能力。服务端和 UI 会根据这些标记决定为使用此适配器的 agent 启用哪些功能（指令包编辑器、skills 同步、JWT 认证等）。

| 标记 | 类型 | 默认值 | 控制内容 |
|------|------|---------|------------------|
| `supportsLocalAgentJwt` | `boolean` | `false` | heartbeat 是否为 agent 生成本地 JWT |
| `supportsInstructionsBundle` | `boolean` | `false` | 托管指令包（AGENTS.md），包括服务端解析和 UI 编辑器 |
| `instructionsPathKey` | `string` | `"instructionsFilePath"` | 存放指令文件路径的 `adapterConfig` 键 |
| `requiresMaterializedRuntimeSkills` | `boolean` | `false` | 执行前是否必须将 runtime skills 条目写入磁盘 |

这些标记会通过 `GET /api/adapters` 在 `capabilities` 对象中公开，同时还会提供派生标记 `supportsSkills`（定义了 `listSkills` 或 `syncSkills` 时为 true）。

### Example

```ts
export function createServerAdapter(): ServerAdapterModule {
  return {
    type: "my_k8s_adapter",
    execute: myExecute,
    testEnvironment: myTestEnvironment,
    listSkills: myListSkills,
    syncSkills: mySyncSkills,

    // Capability flags
    supportsLocalAgentJwt: true,
    supportsInstructionsBundle: true,
    instructionsPathKey: "instructionsFilePath",
    requiresMaterializedRuntimeSkills: true,
  };
}
```

设置这些标记后，Paperclip UI 会自动为使用此适配器的 agent 显示指令包编辑器、skills 管理标签页和工作目录字段，无需修改 Paperclip 源码。

如果未设置能力标记，服务端会对内置适配器类型回退到旧版硬编码列表。未提供这些标记的外部适配器，其所有能力默认均为 `false`。

## Skills 注入

让 agent runtime 能发现 Paperclip skills，同时不向 agent 的工作目录写入内容：

1. **首选：tmpdir + flag** — 创建临时目录，为 skills 创建符号链接，通过 CLI flag 传入，并在之后清理
2. **可接受：全局配置目录** — 将符号链接放到 runtime 的全局插件目录
3. **可接受：环境变量** — 将 skills 路径环境变量指向仓库的 `skills/` 目录
4. **最后手段：注入提示词** — 将 skill 内容加入提示词模板

## 跨运行工作区持久化（no-remote-git 契约）

本地执行工作区的 cwd 是跨运行状态持久化的**唯一**边界。适配器不得依赖 git remote 保存跨运行状态。

支持的往返流程如下：

- **每次运行时，在远端执行。** `packages/adapter-utils/src/ssh.ts` 中的 `prepareWorkspaceForSshExecution` 会将本地工作树打包为 git bundle，并传输到本次运行的远端目录。整个过程中不会设置 `git remote`；bundle 负责传输。
- **运行结束时，在适配器的 `finally` 块中执行。** 适配器调用 `restoreRemoteWorkspace`（例如 claude-local 的 `execute.ts`），后者依次调用 `restoreWorkspaceFromSshExecution` → `exportGitWorkspaceFromSsh` → `integrateImportedGitHead`。运行期间在远端创建的提交会恢复到本地 Mac 工作树，无需 `git push`，也无需配置 remote。

适配器必须遵守以下不变量：

- **绝不在适配器或 runtime 代码中执行 `git push`。** 操作员提供的配置可以选择启用，但默认契约是不执行远端操作。
- **绝不假设 remote 存在。** 两次运行之间以本地 cwd 为准。
- **明确报告恢复失败。** 同步回本地失败时必须传播为运行级错误，不能静默记录警告。heartbeat 会在 `adapter.execute` 前后记录 `workspace_finalize` 行（`succeeded`/`failed`），避免依赖它的 issue 在工作树过期时被唤醒。

`packages/adapter-utils/src/ssh-fixture.test.ts` 中的 “no-remote-git contract” 用例固定了这一不变量：它断言往返流程前后 `git remote` 均为空，并确认只通过恢复即可将仅存在于远端的提交带回本地。

## 安全

- 将 agent 输出视为不可信内容（谨慎解析，绝不执行）
- 通过环境变量注入密钥，不要将其放入提示词
- 如果 runtime 支持网络访问控制，请进行配置
- 始终设置超时和宽限期
- UI 解析器模块运行在浏览器沙箱中，不含 runtime 导入且无副作用

## 后续步骤

- [外部适配器](/adapters/external-adapters) — 构建独立的适配器插件
- [UI 解析器契约](/adapters/adapter-ui-parser) — 提供自定义运行日志解析器
- [Agent 的工作方式](/guides/agent-developer/how-agents-work) — 了解 heartbeat 生命周期
