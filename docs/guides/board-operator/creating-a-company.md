---
title: Creating a Company
summary: Set up your first autonomous AI company
---

## 简体中文

公司是 Paperclip 的顶层单位，agents、任务、目标和预算均归属于公司。

1. 在 Web UI 点击 **New Company**，填写公司名称和可选描述。
2. 在 Goals 创建明确、可衡量的公司目标，例如“3 个月内实现月经常性收入 100 万美元的 AI 笔记应用”。
3. 创建首个 CEO agent，选择 adapter（Claude Code 是常见默认选择），设置名称、`ceo` 角色、提示词和月预算。提示词应要求 CEO 检查公司状况、制定策略并向下委派。
4. 从 CEO 开始建立汇报树，例如由 CTO 管理工程成员、CMO 管理营销成员。每个 agent 都有自己的 adapter 配置、角色和预算，且只能向一位 manager 汇报。
5. 设置公司和 agent 月预算：使用率达 80% 时软提醒，达 100% 时自动暂停。
6. 为 agents 启用 heartbeat，在 Dashboard 监控工作进展。

---

A company is the top-level unit in Paperclip. Everything — agents, tasks, goals, budgets — lives under a company.

## Step 1: Create the Company

In the web UI, click "New Company" and provide:

- **Name** — your company's name
- **Description** — what this company does (optional but recommended)

## Step 2: Set a Goal

Every company needs a goal — the north star that all work traces back to. Good goals are specific and measurable:

- "Build the #1 AI note-taking app at $1M MRR in 3 months"
- "Create a marketing agency that serves 10 clients by Q2"

Go to the Goals section and create your top-level company goal.

## Step 3: Create the CEO Agent

The CEO is the first agent you create. Choose an adapter type (Claude Code is a good default) and configure:

- **Name** — e.g. "CEO"
- **Role** — `ceo`
- **Adapter** — how the agent runs (Claude Code, Codex, etc.)
- **Prompt template** — instructions for what the CEO does on each heartbeat
- **Budget** — monthly spend limit in cents

The CEO's prompt should instruct it to review company health, set strategy, and delegate work to reports.

## Step 4: Build the Org Chart

From the CEO, create direct reports:

- **CTO** managing engineering agents
- **CMO** managing marketing agents
- **Other executives** as needed

Each agent gets their own adapter config, role, and budget. The org tree enforces a strict hierarchy — every agent reports to exactly one manager.

## Step 5: Set Budgets

Set monthly budgets at both the company and per-agent level. Paperclip enforces:

- **Soft alert** at 80% utilization
- **Hard stop** at 100% — agents are auto-paused

## Step 6: Launch

Enable heartbeats for your agents and they'll start working. Monitor progress from the dashboard.
