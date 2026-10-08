---
title: 快速入门
summary: 几分钟内启动 Paperclip
---

## 简体中文

按以下步骤，通常不到 5 分钟即可在本机启动 Paperclip。

### 推荐方式

```sh
npx paperclipai onboard --yes
```

该命令会完成初始化、配置环境并启动 Paperclip。已有安装时重新运行 `onboard` 会保留当前配置和数据路径；要修改设置，请运行 `paperclipai configure`。

之后再次启动：

```sh
npx paperclipai run
```

> 如果用 `npx` 初始化，请始终用 `npx paperclipai` 执行命令。`pnpm paperclipai` 仅适用于已克隆的 Paperclip 仓库。

### 本地开发

贡献 Paperclip 代码时，需要 Node.js 24.11+ 和 pnpm 9+。克隆仓库后运行：

```sh
pnpm install
pnpm dev
```

API 服务和 UI 会在 [http://localhost:3100](http://localhost:3100) 启动。默认使用内嵌 PostgreSQL，无需外部数据库。在克隆仓库内也可以运行 `pnpm paperclipai run`；若缺少配置，它会自动初始化，并执行健康检查和自动修复后启动服务。

### 启动后

1. 在 Web UI 创建公司并设定公司目标；
2. 创建 CEO agent 并配置 adapter；
3. 添加其他 agents，建立组织图；
4. 设置预算并分配初始任务；
5. 启动 heartbeat，在仪表板查看进度。

请继续阅读[核心概念](/start/core-concepts)。

---

Get Paperclip running locally in under 5 minutes.

## Quick Start (Recommended)

```sh
npx paperclipai onboard --yes
```

This walks you through setup, configures your environment, and gets Paperclip running.

If you already have a Paperclip install, rerunning `onboard` keeps your current config and data paths intact. Use `paperclipai configure` if you want to edit settings.

To start Paperclip again later:

```sh
npx paperclipai run
```

> **Note:** If you used `npx` for setup, always use `npx paperclipai` to run commands. The `pnpm paperclipai` form only works inside a cloned copy of the Paperclip repository (see Local Development below).

## Local Development

For contributors working on Paperclip itself. Prerequisites: Node.js 24.11+ and pnpm 9+.

Clone the repository, then:

```sh
pnpm install
pnpm dev
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

No external database required — Paperclip uses an embedded PostgreSQL instance by default.

When working from the cloned repo, you can also use:

```sh
pnpm paperclipai run
```

This auto-onboards if config is missing, runs health checks with auto-repair, and starts the server.

## What's Next

Once Paperclip is running:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter
4. Build out the org chart with more agents
5. Set budgets and assign initial tasks
6. Hit go — agents start their heartbeats and the company runs

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind Paperclip
</Card>
