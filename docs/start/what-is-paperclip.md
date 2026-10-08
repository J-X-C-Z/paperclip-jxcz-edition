---
title: Paperclip 是什么？
summary: 自主 AI 公司的控制平面
---

## 简体中文

Paperclip 是面向自主 AI 公司的控制平面，也是让 AI 团队有组织、受治理且可追责地工作的基础设施。一个实例可以运行多家公司；每家公司都有自己的 AI 员工（agents）、组织结构、目标、预算和任务。

### Paperclip 解决什么问题

普通任务管理工具无法管理完整的 AI 团队。Paperclip 提供统一的指挥、沟通和控制入口，帮助你：

- 把 agents 当作员工管理：聘用、组织并跟踪各自职责；
- 定义组织结构和汇报关系；
- 实时查看 agents 正在做什么；
- 跟踪 token 支出和预算；
- 将工作关联到公司目标；
- 通过审批、活动审计和预算约束治理自主运行。

### 两个组成部分

1. **控制平面（Paperclip）**：管理 agent 名册与组织图、任务分配和状态、预算与 token 支出、目标层级和 heartbeat 监控。
2. **执行服务（Adapters）**：agents 在外部运行，通过 adapter 接入 Paperclip，例如 Claude Code、OpenAI Codex、shell process、HTTP webhook，或任何能调用 API 的运行时。

控制平面负责编排，不直接运行 agents。最终应能在 Paperclip 中一眼看清公司全貌：谁在做什么、花费多少、进展是否有效。

---

Paperclip is the control plane for autonomous AI companies. It is the infrastructure backbone that enables AI workforces to operate with structure, governance, and accountability.

One instance of Paperclip can run multiple companies. Each company has employees (AI agents), org structure, goals, budgets, and task management — everything a real company needs, except the operating system is real software.

## The Problem

Task management software doesn't go far enough. When your entire workforce is AI agents, you need more than a to-do list — you need a **control plane** for an entire company.

## What Paperclip Does

Paperclip is the command, communication, and control plane for a company of AI agents. It is the single place where you:

- **Manage agents as employees** — hire, organize, and track who does what
- **Define org structure** — org charts that agents themselves operate within
- **Track work in real time** — see at any moment what every agent is working on
- **Control costs** — token salary budgets per agent, spend tracking, burn rate
- **Align to goals** — agents see how their work serves the bigger mission
- **Govern autonomy** — board approval gates, activity audit trails, budget enforcement

## Two Layers

### 1. Control Plane (Paperclip)

The central nervous system. Manages agent registry and org chart, task assignment and status, budget and token spend tracking, goal hierarchy, and heartbeat monitoring.

### 2. Execution Services (Adapters)

Agents run externally and report into the control plane. Adapters connect different execution environments — Claude Code, OpenAI Codex, shell processes, HTTP webhooks, or any runtime that can call an API.

The control plane doesn't run agents. It orchestrates them. Agents run wherever they run and phone home.

## Core Principle

You should be able to look at Paperclip and understand your entire company at a glance — who's doing what, how much it costs, and whether it's working.
