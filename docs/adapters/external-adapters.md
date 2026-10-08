---
title: 外部适配器
summary: 无需修改 Paperclip 源码，即可将适配器构建、打包并作为插件分发
---

Paperclip 支持从 npm 包或本地目录安装外部适配器插件。外部适配器的工作方式与内置适配器完全相同：运行 agent、解析输出并渲染对话记录；区别在于它们位于独立的软件包中，无需修改 Paperclip 源码。

## 内置适配器与外部适配器

| | 内置 | 外部 |
|---|---|---|
| 源码位置 | `paperclip-fork/packages/adapters/` 内 | 独立 npm 包或本地目录 |
| 注册方式 | 写入三个注册表 | 启动时通过插件系统加载 |
| UI 解析器 | 构建时静态导入 | 通过 API 动态加载（参见 [UI 解析器](/adapters/adapter-ui-parser)） |
| 分发方式 | 随 Paperclip 一起发布 | 发布到 npm 或通过 `file:` 链接 |
| 更新方式 | 需要发布 Paperclip 新版本 | 独立管理版本 |

### 内置 Hermes 兼容性说明

内置 Hermes 使用两个稳定的适配器类型键：

- `hermes_local` 使用 `@paperclipai/hermes-paperclip-adapter` 启动本地 Hermes CLI。
- `hermes_gateway` 通过 `@paperclipai/hermes-paperclip-adapter/gateway` 调用已运行的 Hermes API 服务。

旧版 `@paperclipai/adapter-hermes-gateway` 包将在一个版本周期内作为已弃用的兼容垫片保留。它会保留旧的 gateway 导出，同时转发到统一的 Hermes 包。新的外部覆盖包应依赖或链接 `@paperclipai/hermes-paperclip-adapter`，并声明要覆盖的类型（`hermes_local` 或 `hermes_gateway`）；类型键没有变化。

## 快速开始

### 最小软件包结构

```
my-adapter/
  package.json
  tsconfig.json
  src/
    index.ts            # Shared metadata (type, label, models)
    server/
      index.ts          # createServerAdapter() factory
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui-parser.ts        # Self-contained UI transcript parser
```

### package.json

```json
{
  "name": "my-paperclip-adapter",
  "version": "1.0.0",
  "type": "module",
  "license": "MIT",
  "paperclip": {
    "adapterUiParser": "1.0.0"
  },
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server/index.js",
    "./ui-parser": "./dist/ui-parser.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@paperclipai/adapter-utils": "^2026.325.0",
    "picocolors": "^1.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.0"
  }
}
```

关键字段：

| 字段 | 用途 |
|-------|---------|
| `exports["."]` | 入口点，必须导出 `createServerAdapter` |
| `exports["./ui-parser"]` | 独立的 UI 解析器模块（可选，但建议提供） |
| `paperclip.adapterUiParser` | UI 解析器的契约版本（`"1.0.0"`） |
| `files` | 限定发布内容，仅包含 `dist/` |

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

## 服务端模块

插件加载器会从软件包根目录调用 `createServerAdapter()`。此函数必须返回 `ServerAdapterModule`。

### src/index.ts

```ts
export const type = "my_adapter";     // snake_case, globally unique
export const label = "My Agent";

export const models = [
  { id: "model-a", label: "Model A" },
];

export const agentConfigurationDoc = `# my_adapter configuration
Use when: ...
Don't use when: ...
`;

// Required by plugin-loader convention
export { createServerAdapter } from "./server/index.js";
```

### src/server/index.ts

```ts
import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { type, models, agentConfigurationDoc } from "../index.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    models,
    agentConfigurationDoc,
  };
}
```

### src/server/execute.ts

核心执行函数。接收 `AdapterExecutionContext` 并返回 `AdapterExecutionResult`。

```ts
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";

import {
  runChildProcess,
  buildPaperclipEnv,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { config, agent, runtime, context, onLog, onMeta } = ctx;

  // 1. Read config with safe helpers
  const cwd = String(config.cwd ?? "/tmp");
  const command = String(config.command ?? "my-agent");
  const timeoutSec = Number(config.timeoutSec ?? 300);

  // 2. Build environment with Paperclip vars injected
  const env = buildPaperclipEnv(agent);

  // 3. Render prompt template
  const prompt = config.promptTemplate
    ? renderTemplate(String(config.promptTemplate), {
        agentId: agent.id,
        agentName: agent.name,
        companyId: agent.companyId,
        runId: ctx.runId,
        taskId: context.taskId ?? "",
        taskTitle: context.taskTitle ?? "",
      })
    : "Continue your work.";

  // 4. Spawn process
  const result = await runChildProcess(command, {
    args: [prompt],
    cwd,
    env,
    timeout: timeoutSec * 1000,
    graceMs: 10_000,
    onStdout: (chunk) => onLog("stdout", chunk),
    onStderr: (chunk) => onLog("stderr", chunk),
  });

  // 5. Return structured result
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    // Include session state for persistence
    sessionParams: { /* ... */ },
  };
}
```

#### `@paperclipai/adapter-utils` 提供的辅助函数

| 辅助函数 | 用途 |
|--------|---------|
| `runChildProcess(command, opts)` | 启动子进程，并支持超时、宽限期和流式回调 |
| `buildPaperclipEnv(agent)` | 注入 `PAPERCLIP_*` 环境变量 |
| `renderTemplate(template, data)` | 替换提示词模板中的 `{{variable}}` |
| `asString(v)`、`asNumber(v)`、`asBoolean(v)` | 安全地提取配置值 |

### src/server/test.ts

运行前验证适配器配置，并返回结构化诊断信息。

```ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks = [];

  // Example: check CLI is installed
  checks.push({
    level: "info",
    message: "My Agent CLI v1.2.0 detected",
    code: "cli_detected",
  });

  // Example: check working directory
  const cwd = String(ctx.config.cwd ?? "");
  if (!cwd.startsWith("/")) {
    checks.push({
      level: "error",
      message: `Working directory must be absolute: "${cwd}"`,
      hint: "Use /home/user/project or /workspace",
      code: "invalid_cwd",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: checks.some(c => c.level === "error") ? "fail" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
```

检查级别：

| 级别 | 含义 | 影响 |
|-------|---------|--------|
| `info` | 提示信息 | 显示在测试结果中 |
| `warn` | 非阻断问题 | 以黄色标记显示 |
| `error` | 阻止执行 | agent 无法运行 |

## 安装

### 从 npm 安装

```sh
# Via the Paperclip UI
# Settings → Adapters → Install from npm → "my-paperclip-adapter"

# Or via API
curl -X POST http://localhost:3102/api/adapters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"packageName": "my-paperclip-adapter"}'
```

### 从本地目录安装

```sh
curl -X POST http://localhost:3102/api/adapters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"localPath": "/home/user/my-adapter"}'
```

本地适配器会以符号链接的形式加入 Paperclip 的适配器目录。服务器重启后会加载源目录中的更改。

### 通过 adapter-plugins.json 安装

开发时，也可以直接编辑 `~/.paperclip/adapter-plugins.json`：

```json
[
  {
    "packageName": "my-paperclip-adapter",
    "localPath": "/home/user/my-adapter",
    "type": "my_adapter",
    "installedAt": "2026-03-30T12:00:00.000Z"
  }
]
```

## 可选：会话持久化

如果 agent runtime 支持会话（可在多个 heartbeat 之间延续对话），请实现会话编解码器：

```ts
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    return r.sessionId ? { sessionId: String(r.sessionId) } : null;
  },
  serialize(params) {
    return params?.sessionId ? { sessionId: String(params.sessionId) } : null;
  },
  getDisplayId(params) {
    return params?.sessionId ? String(params.sessionId) : null;
  },
};
```

在 `createServerAdapter()` 中包含它：

```ts
return { type, execute, testEnvironment, sessionCodec, /* ... */ };
```

## 可选：Skills 同步

如果 agent runtime 支持 skills 或插件，请实现 `listSkills` 和 `syncSkills`：

```ts
return {
  type,
  execute,
  testEnvironment,
  async listSkills(ctx) {
    return {
      adapterType: ctx.adapterType,
      supported: true,
      mode: "ephemeral",
      desiredSkills: [],
      entries: [],
      warnings: [],
    };
  },
  async syncSkills(ctx, desiredSkills) {
    // Install desired skills into the runtime
    return { /* same shape as listSkills */ };
  },
};
```

## 可选：模型检测

如果 runtime 有指定默认模型的本地配置文件：

```ts
async function detectModel() {
  // Read ~/.my-agent/config.yaml or similar
  return {
    model: "anthropic/claude-sonnet-4",
    provider: "anthropic",
    source: "~/.my-agent/config.yaml",
    candidates: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
  };
}

return { type, execute, testEnvironment, detectModel: () => detectModel() };
```

## 发布

```sh
npm run build
npm publish
```

之后，其他 Paperclip 用户可以在 UI 或通过 API 按包名安装你的适配器。

## 安全

- 将 agent 输出视为不可信内容：谨慎解析，绝不对 agent 输出调用 `eval()`
- 通过环境变量注入密钥，不要将其放入提示词
- 如果 runtime 支持网络访问控制，请进行配置
- 始终设置超时和宽限期，避免 agent 无限运行
- UI 解析器模块运行在浏览器沙箱中，因此不能有任何 runtime 导入或副作用

## 后续步骤

- [UI 解析器契约](/adapters/adapter-ui-parser) — 添加自定义运行日志解析器，让 UI 正确呈现适配器输出
- [创建适配器](/adapters/creating-an-adapter) — 完整了解适配器内部机制
- [Agent 的工作方式](/guides/agent-developer/how-agents-work) — 了解适配器所服务的 heartbeat 生命周期
