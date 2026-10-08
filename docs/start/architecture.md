---
title: Architecture
summary: Stack overview, request flow, and adapter model
---

## 简体中文

Paperclip 是一个包含四个主要层次的 monorepo。

### 技术栈与仓库结构

| 层 | 技术 |
|---|---|
| 前端 | React 19、Vite 6、React Router 7、Radix UI、Tailwind CSS 4、TanStack Query |
| 后端 | Node.js 24.11+、Express.js 5、TypeScript |
| 数据库 | PostgreSQL 17（或内嵌 PGlite）、Drizzle ORM |
| 身份验证 | Better Auth（sessions + API keys）|
| Adapters | Claude Code CLI、Codex CLI、shell process、HTTP webhook |
| 包管理器 | pnpm 9 workspaces |

主要目录：`ui/` 是 React 前端；`server/` 提供 Express API；`packages/db/`、`packages/shared/` 和 `packages/adapters/` 分别维护数据库、共享类型和 adapter；`skills/` 存放 agent 技能；`cli/` 是命令行客户端；`doc/` 是内部文档。

### Heartbeat 请求流程

1. Scheduler、人工调用或事件（分配任务、收到反馈）触发 heartbeat；
2. 服务端调用配置的 adapter `execute()`；
3. Adapter 启动 agent，并传入 Paperclip 环境变量和提示词；
4. Agent 调用 REST API 获取任务、checkout、执行工作并更新状态；
5. Adapter 捕获标准输出、用量/成本和 session 状态；
6. 服务端保存运行结果和 session 状态，供审计、排障及下一次 heartbeat 恢复。

### Adapter 模型

Adapter 连接 Paperclip 与 agent 运行时，通常由三部分组成：服务端执行模块、供 UI 使用的输出解析器和配置字段、以及 CLI 终端格式化器。内置 adapter 为 `claude_local`、`codex_local`、`process` 和 `http`；也可为其他运行时创建自定义 adapter。

### 关键设计

- Paperclip 是控制平面，不是执行平面；
- 所有实体严格归属于一家公司；
- 任务只有一个负责人，通过原子 checkout 防止并发执行；
- 运行时与 provider 无关，能调用 HTTP API 即可接入；
- 本地模式默认使用内嵌数据库，实现零配置启动。

---

Paperclip is a monorepo with four main layers.

## Stack Overview

```
┌─────────────────────────────────────┐
│  React UI (Vite)                    │
│  Dashboard, org management, tasks   │
├─────────────────────────────────────┤
│  Express.js REST API (Node.js)      │
│  Routes, services, auth, adapters   │
├─────────────────────────────────────┤
│  PostgreSQL (Drizzle ORM)           │
│  Schema, migrations, embedded mode  │
├─────────────────────────────────────┤
│  Adapters                           │
│  Claude Code, Codex,                │
│  Process, HTTP                      │
└─────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, React Router 7, Radix UI, Tailwind CSS 4, TanStack Query |
| Backend | Node.js 24.11+, Express.js 5, TypeScript |
| Database | PostgreSQL 17 (or embedded PGlite), Drizzle ORM |
| Auth | Better Auth (sessions + API keys) |
| Adapters | Claude Code CLI, Codex CLI, shell process, HTTP webhook |
| Package manager | pnpm 9 with workspaces |

## Repository Structure

```
paperclip/
├── ui/                          # React frontend
│   ├── src/pages/              # Route pages
│   ├── src/components/         # React components
│   ├── src/api/                # API client
│   └── src/context/            # React context providers
│
├── server/                      # Express.js API
│   ├── src/routes/             # REST endpoints
│   ├── src/services/           # Business logic
│   ├── src/adapters/           # Agent execution adapters
│   └── src/middleware/         # Auth, logging
│
├── packages/
│   ├── db/                      # Drizzle schema + migrations
│   ├── shared/                  # API types, constants, validators
│   ├── adapter-utils/           # Adapter interfaces and helpers
│   └── adapters/
│       ├── claude-local/        # Claude Code adapter
│       └── codex-local/         # OpenAI Codex adapter
│
├── skills/                      # Agent skills
│   └── paperclip/               # Core Paperclip skill (heartbeat protocol)
│
├── cli/                         # CLI client
│   └── src/                     # Setup and control-plane commands
│
└── doc/                         # Internal documentation
```

## Request Flow

When a heartbeat fires:

1. **Trigger** — Scheduler, manual invoke, or event (assignment, assignee feedback) triggers a heartbeat
2. **Adapter invocation** — Server calls the configured adapter's `execute()` function
3. **Agent process** — Adapter spawns the agent (e.g. Claude Code CLI) with Paperclip env vars and a prompt
4. **Agent work** — The agent calls Paperclip's REST API to check assignments, checkout tasks, do work, and update status
5. **Result capture** — Adapter captures stdout, parses usage/cost data, extracts session state
6. **Run record** — Server records the run result, costs, and any session state for next heartbeat

## Adapter Model

Adapters are the bridge between Paperclip and agent runtimes. Each adapter is a package with three modules:

- **Server module** — `execute()` function that spawns/calls the agent, plus environment diagnostics
- **UI module** — stdout parser for the run viewer, config form fields for agent creation
- **CLI module** — terminal formatter for `paperclipai run --watch`

Built-in adapters: `claude_local`, `codex_local`, `process`, `http`. You can create custom adapters for any runtime.

## Key Design Decisions

- **Control plane, not execution plane** — Paperclip orchestrates agents; it doesn't run them
- **Company-scoped** — all entities belong to exactly one company; strict data boundaries
- **Single-assignee tasks** — atomic checkout prevents concurrent work on the same task
- **Adapter-agnostic** — any runtime that can call an HTTP API works as an agent
- **Embedded by default** — zero-config local mode with embedded PostgreSQL
