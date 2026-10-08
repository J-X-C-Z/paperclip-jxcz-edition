---
title: 适配器 UI 解析器契约
summary: 提供自定义运行日志解析器，让 Paperclip UI 正确呈现适配器输出
---

Paperclip 运行 agent 时，会将 stdout 实时流式传输到 UI。UI 需要一个**解析器**，将原始 stdout 行转换为结构化对话记录条目（工具调用、工具结果、assistant 消息、系统事件）。如果没有自定义解析器，UI 会退回到通用 shell 解析器，将所有非系统行都视为 `assistant` 输出，导致工具命令以纯文本显示、耗时信息丢失、错误不可见。

## 问题

大多数 agent CLI 会输出结构化 stdout，其中包含工具调用、进度指示和多行内容。例如：

```
[hermes] Session resumed: abc123
┊ 💬 Thinking about how to approach this...
┊ $ ls /home/user/project
┊ [done] $ ls /home/user/project — /src /README.md  0.3s
┊ 💬 I see the project structure. Let me read the README.
┊ read /home/user/project/README.md
┊ [done] read — Project Overview: A CLI tool for...  1.2s
The project is a CLI tool. Here's what I found:
- It uses TypeScript
- Tests are in /tests
```

没有解析器时，UI 会把这些内容全部显示为原始 `assistant` 文本，无法区分工具调用、工具结果和 agent 的实际回复。

使用解析器后，UI 会这样呈现：

- `Thinking about how to approach this...` 显示为可折叠的思考内容块
- `$ ls /home/user/project` 显示为工具调用卡片（默认折叠）
- `0.3s` 耗时显示在工具结果卡片中
- `The project is a CLI tool...` 显示为 assistant 回复

## 工作原理

```
┌──────────────────┐     package.json        ┌──────────────────┐
│  Adapter Package  │─── exports["./ui-parser"] ──→│  dist/ui-parser.js │
│  (npm / local)    │                          │  (zero imports)  │
└──────────────────┘                          └────────┬─────────┘
                                                       │ plugin-loader reads at startup
                                                       ▼
┌──────────────────┐   GET /api/:type/ui-parser.js   ┌──────────────────┐
│  Paperclip Server  │◄────────────────────────────────│  uiParserCache    │
│  (in-memory)      │                                 └──────────────────┘
└────────┬─────────┘
         │ serves JS to browser
         ▼
┌──────────────────┐   fetch() + eval   ┌──────────────────┐
│  Paperclip UI     │─────────────────────→│  parseStdoutLine │
│  (dynamic loader) │   registers parser  │  (per-adapter)   │
└──────────────────┘                     └──────────────────┘
```

1. **构建时** — 将 `src/ui-parser.ts` 编译为 `dist/ui-parser.js`（不含 runtime 导入）
2. **服务端启动时** — 插件加载器读取文件并缓存到内存
3. **UI 加载时** — 用户打开一次运行记录时，UI 会从 `GET /api/:type/ui-parser.js` 获取解析器
4. **运行时** — 获取到的模块经 eval 后注册。之后的所有日志行都会使用实际解析器

## 契约：package.json

### 1. `paperclip.adapterUiParser` — 契约版本

```json
{
  "paperclip": {
    "adapterUiParser": "1.0.0"
  }
}
```

Paperclip 宿主会检查此字段。如果不支持该主版本，宿主会记录警告并退回到通用解析器，而不会执行可能不兼容的代码。

| 宿主预期版本 | 适配器声明版本 | 结果 |
|---|---|---|
| `1.x` | `1.0.0` | 加载解析器 |
| `1.x` | `2.0.0` | 记录警告，使用通用解析器 |
| `1.x` | （缺失） | 加载解析器（宽限期，未来版本可能会要求提供该字段） |

### 2. `exports["./ui-parser"]` — 文件路径

```json
{
  "exports": {
    ".": "./dist/server/index.js",
    "./ui-parser": "./dist/ui-parser.js"
  }
}
```

## 契约：模块导出

`dist/ui-parser.js` 必须至少导出以下其中一项：

### `parseStdoutLine(line: string, ts: string): TranscriptEntry[]`

静态解析器。适配器 stdout 的每一行都会调用此函数。

```ts
export function parseStdoutLine(line: string, ts: string): TranscriptEntry[] {
  if (line.startsWith("[my-agent]")) {
    return [{ kind: "system", ts, text: line }];
  }
  return [{ kind: "assistant", ts, text: line }];
}
```

### `createStdoutParser(): { parseLine(line, ts): TranscriptEntry[]; reset(): void }`

有状态的解析器工厂。如果解析器需要跟踪多行续接、命令嵌套或其他跨调用状态，建议使用此方式。

```ts
let counter = 0;

export function createStdoutParser() {
  let suppressContinuation = false;

  function parseLine(line: string, ts: string): TranscriptEntry[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    if (suppressContinuation) {
      if (/^[\d.]+s$/.test(trimmed)) {
        suppressContinuation = false;
        return [];
      }
      return []; // swallow continuation lines
    }

    if (trimmed.startsWith("[tool-done]")) {
      const id = `tool-${++counter}`;
      suppressContinuation = true;
      return [
        { kind: "tool_call", ts, name: "shell", input: {}, toolUseId: id },
        { kind: "tool_result", ts, toolUseId: id, content: trimmed, isError: false },
      ];
    }

    return [{ kind: "assistant", ts, text: trimmed }];
  }

  function reset() {
    suppressContinuation = false;
  }

  return { parseLine, reset };
}
```

如果两者都导出，则优先使用 `createStdoutParser`。

## 契约：TranscriptEntry

每个条目必须符合以下某一种可辨识联合类型：

```ts
// Assistant message
{ kind: "assistant"; ts: string; text: string; delta?: boolean }

// Thinking / reasoning
{ kind: "thinking"; ts: string; text: string; delta?: boolean }

// User message (rare — usually from agent-initiated prompts)
{ kind: "user"; ts: string; text: string }

// Tool invocation
{ kind: "tool_call"; ts: string; name: string; input: unknown; toolUseId?: string }

// Tool result
{ kind: "tool_result"; ts: string; toolUseId: string; content: string; isError: boolean }

// System / adapter messages
{ kind: "system"; ts: string; text: string }

// Stderr / errors
{ kind: "stderr"; ts: string; text: string }

// Raw stdout (fallback)
{ kind: "stdout"; ts: string; text: string }
```

### 将工具调用与结果关联起来

使用 `toolUseId` 将 `tool_call` 和 `tool_result` 条目配对。UI 会将它们显示为可折叠卡片。

```ts
const id = `my-tool-${++counter}`;
return [
  { kind: "tool_call", ts, name: "read", input: { path: "/src/main.ts" }, toolUseId: id },
  { kind: "tool_result", ts, toolUseId: id, content: "const main = () => {...}", isError: false },
];
```

### 错误处理

将工具结果中的 `isError` 设为 `true`，即可显示红色错误标记：

```ts
{ kind: "tool_result", ts, toolUseId: id, content: "ENOENT: no such file", isError: true }
```

## 限制

1. **不含 runtime 导入。** 文件会在浏览器中通过 `URL.createObjectURL` 和动态 `import()` 加载。不得使用 `import`、`require` 或顶层 `await`。

2. **不使用 DOM / Node.js API。** 解析器运行在浏览器沙箱中，只能使用原生 JS（ES2020+）。

3. **无副作用。** 模块级代码不得修改全局变量、访问 `window` 或执行 I/O；只声明并导出函数。

4. **结果确定。** 对相同的 `(line, ts)` 输入必须产生相同输出，这对日志回放很重要。

5. **容错。** 不得抛出异常。遇到无法解析的行时，返回 `[{ kind: "stdout", ts, text: line }]`，不要让对话记录崩溃。

6. **文件大小。** 保持在 50 KB 以内。此文件会按请求提供给浏览器并在其中 eval。

## 生命周期

| 事件 | 发生的操作 |
|---|---|
| 服务端启动 | 插件加载器读取 `exports["./ui-parser"]` 对应的文件并缓存到内存 |
| UI 打开运行记录 | 调用 `getUIAdapter(type)`。如果没有内置解析器，就会异步发起 `fetch(/api/:type/ui-parser.js)` |
| 收到首批日志行 | 通用进程解析器立即处理（不会阻塞），同时在后台加载动态解析器 |
| 解析器加载完成 | 调用 `registerUIAdapter()`。之后的日志行都由实际解析器处理 |
| 解析器加载失败（404、eval 错误） | 在控制台记录警告，继续使用通用解析器。失败类型会被缓存，不再重试 |
| 服务端重启 | 从适配器包重新填充内存缓存 |

## 错误处理行为

| 失败情况 | 处理方式 |
|---|---|
| 模块语法错误（导入失败） | 捕获并记录错误，然后退回到通用解析器，不再重试。 |
| 返回结构不正确 | 对话记录构建器会静默忽略缺少字段的单个条目。 |
| 运行时抛出异常 | 逐行捕获异常，该行退回到通用解析器；解析器仍会为后续日志行保留注册状态。 |
| 404（未导出 ui-parser） | 将类型加入加载失败集合，从首次调用起使用通用解析器。 |
| 契约版本不匹配 | 服务端记录警告并跳过加载，改用通用解析器。 |

## 构建

```sh
# Compile TypeScript to JavaScript
tsc src/ui-parser.ts --outDir dist --target ES2020 --module ES2020 --declaration false
```

也可以通过 `tsconfig.json` 自动处理。只需确保构建包含 `ui-parser.ts`，并输出到 `dist/ui-parser.js`。

## 测试

可以使用示例 stdout 在本地测试解析器：

```ts
// test-parser.ts
import { createStdoutParser } from "./dist/ui-parser.js";

const parser = createStdoutParser();
const sampleLines = [
  "[my-agent] Starting session abc123",
  "Thinking about the task...",
  "$ ls /home/user/project",
  "[done] $ ls — /src /README.md  0.3s",
  "I'll read the README now.",
  "Error: file not found",
];

for (const line of sampleLines) {
  const entries = parser.parseLine(line, new Date().toISOString());
  for (const entry of entries) {
    console.log(`  ${entry.kind}:`, entry.text ?? entry.name ?? entry.content);
  }
}
```

运行命令：`npx tsx test-parser.ts`

## 跳过 UI 解析器

如果适配器的 stdout 格式简单（没有工具标记或特殊格式），可以完全跳过 UI 解析器，交由通用 `process` 解析器处理：每个非系统行都会成为 `assistant` 输出。以下情况适合这样做：

- 只输出纯文本回复的 agent
- 只负责打印结果的自定义脚本
- 不产生结构化输出的简单 CLI

要跳过解析器，只需不要在 `package.json` 中包含 `exports["./ui-parser"]`。

## 后续步骤

- [外部适配器](/adapters/external-adapters) — 构建适配器软件包的完整指南
- [创建适配器](/adapters/creating-an-adapter) — 适配器内部机制和内置集成
