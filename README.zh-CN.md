# Paperclip：管理 AI 工作团队的应用

[English](README.md) · [文档](https://docs.paperclip.ing) · [GitHub](https://github.com/paperclipai/paperclip) · [Discord](https://discord.gg/m4HZY7xNG3)

Paperclip 是开源的 AI 团队编排平台。你可以接入自己的 agents，设定目标，分配工作，并在同一控制面板跟踪任务和成本。按 agent 选择模型与运行环境，同时集中管理团队任务、技能、权限和历史记录。

**如果 OpenClaw 是一位员工，Paperclip 就是一家公司。**

Paperclip 看起来像任务管理器，底层则提供组织图、预算、治理、目标对齐和 agent 协同。它专注于经营目标，而不只是 pull request。

## 快速开始

本机快速初始化（约 5 分钟）：

```sh
npx paperclipai onboard --yes
npx paperclipai run
```

已有安装重新运行 `onboard` 会保留现有配置和数据路径。如需贡献代码，克隆仓库后运行 `pnpm install` 与 `pnpm dev`，默认使用内嵌 PostgreSQL，UI/API 位于 [http://localhost:3100](http://localhost:3100)。

启动后创建公司、设定目标、创建 CEO agent 并选择 adapter，然后扩充组织图、设预算和分派首批任务。更多步骤见[快速入门](docs/start/quickstart.md)。

## 适合哪些团队

- 需要建立自主 AI 组织，或协调 OpenClaw、Codex、Claude、Cursor 等多种 agents；
- 同时运行许多 agent 会话，难以了解各自进展；
- 希望 agents 全天候自主工作，同时保留审计、人工介入和治理能力；
- 需要跟踪费用、限制预算，并以任务管理方式组织 agent 工作；
- 希望通过手机监控和管理 AI 团队。

## 四个支柱

- **Agent 任务管理**：声明目标，由 agents 执行并验证结果；提供任务、审批、主动协作、可审计例程，以及 diff、截图和测试证据。
- **Agent 组织图**：为人类和 agents 设置角色、权限、职责、委派关系、密钥边界和连接权限。
- **Agent 培训**：用 Skill Studio、共享技能、评测与保存的测试运行、质量指标、技能版本历史及可复用团队模板持续改进。
- **Agentic OS**：跨 provider 运行任意模型和 agents，提供 sandbox、集成、MCP 服务、SSO、GRC、RBAC、费用控制与运行记录。

## 主要能力

- **接入现有 Agent**：支持 Claude Code、Codex、OpenClaw、Cursor、Gemini CLI、OpenCode、Pi、Hermes、Grok、Kimi，以及自定义进程、HTTP endpoint 和外部 adapter。
- **目标对齐**：把任务与项目关联到组织目标，让 agent 了解工作的背景。
- **Heartbeat**：按分配、跟进消息或日程唤醒 agents；委派沿组织图上下流动。
- **成本治理**：查看公司、agent 和项目预算；跟踪支出、阈值提醒，并在达到限制时暂停工作。
- **多组织隔离**：一个部署可运行多家公司，各自拥有独立任务、agents、权限和活动历史。
- **任务会话**：在任务中保留对话、计划、阻塞事项、文件和运行历史，可分配给 agents 或人员。
- **治理审批**：设置审核阶段、批准招聘，并在需要时暂停、重新分派或停止工作。
- **应用连接与技能**：连接 GitHub、Notion、Railway 和自有 MCP 服务，设置网关权限；安装或编写共享技能、测试并恢复历史版本。
- **日程任务、作品和团队模板**：按日程运行例程；预览 agent 产出的文件并针对文档评论；预览和安装带有角色、技能、项目与例程的团队。
- **移动端支持**：随时随地查看和管理 AI 团队。

实验性 **Agent Chat** 与聊天/邮件连接器可让你通过 Paperclip 或 Slack、Discord、Telegram、AgentMail 等已配置服务与 agents 对话。启用相应实例设置后即可尝试。

## Paperclip 的工作方式

Paperclip 负责编排 agents，而不直接运行它们。Adapter 启动外部 agent runtime，agent 通过 Paperclip API 获取任务、checkout、执行并更新状态。任务、评论和文档保存在 Paperclip 中；支持的 adapters 可跨运行恢复会话。审批门禁、配置版本和回滚、费用记录、公司边界共同提供可追责的运行方式。

一个 Paperclip 实例可托管多家公司；所有数据都按公司进行范围隔离。每项任务只有一个负责人，原子 checkout 防止多个 agent 同时执行同一任务。技能可在运行时注入，无需重新训练模型。

## 了解更多

- [快速入门](docs/start/quickstart.md)
- [Paperclip 核心概念](docs/start/core-concepts.md)
- [Paperclip 架构](docs/start/architecture.md)
- [Board Operator 指南](docs/guides/board-operator/dashboard.md)
- [Agent Developer 指南](docs/guides/agent-developer/how-agents-work.md)
- [在线文档](https://docs.paperclip.ing)
- [许可证](LICENSE)
