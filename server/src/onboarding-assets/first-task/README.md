# 首个任务引导资源

首位智能体在引导期间收到的内容都以纯 Markdown 保存在这里，董事会可以直接编辑文案，无需修改 TypeScript。服务器在创建新组织的首个任务和招聘首位智能体时会加载这些文件（参见 `server/src/services/onboarding-first-task-assets.ts` 和 `server/src/services/onboarding-greeting.ts`）。首位智能体还会通过常规公司技能清单和智能体技能分配流程获得内置的 `first-task` 技能。

## Files

| 文件 | 层级 | 说明 |
| --- | --- | --- |
| `greeting.md` | C | 服务器以智能体身份、在任何流程运行前于首个任务中发送的固定问候语。不使用 LLM。 |
| `opening-question.json` | C | 问候语之后服务器以智能体身份发送的固定 `ask_user_questions` 卡片：可选“采访我，并提出计划和执行计划的智能体团队。”或“我有一个任务想做”（自由文本）。`interview` 和 `task` 选项 ID 固定，因为 `first-task` 技能会引用它们；`task` 选项必须保留 `freeText: true`。不使用 LLM。 |
| `brief.md` | A | 首个任务的隐藏描述：简短的 `/first-task` 调用，以及创建任务时选定的 `{{proposalMode}}`。 |
| `skills/first-task/SKILL.md` | A（工作流） | 首个任务的完整策略：处理开场回答、访谈、提案、审批和执行。包含两种单任务提案模式。 |
| `chief-of-staff/AGENTS.md` | B | 招聘时写入首位智能体入口指令文件的幕僚长角色设定。 |
| `README.md` | — | 本文件。 |

## 开场卡片

`opening-question.json` 是一道单选题。它的 `prompt`、可选的 `helpText`、可选的 `submitLabel` 以及两个选项的 `label`/`description` 均可编辑。选择选项只会选中它；用户按下主按钮（`submitLabel`，即“继续”）后才会提交。所有问题卡片行为一致：点击“下一步/提交”提交回答；可选问题可以跳过；点击“取消”返回普通输入框，同时保留待处理卡片。创建首个任务时，服务器会校验此文件；如果任一选项 ID 被更改，或 `task` 选项不再包含 `freeText: true`，服务器会拒绝该卡片并记录警告，但仍会创建任务。用户提交回答后，回答会进入智能体的唤醒载荷，`first-task` 技能会指示后续流程；如果用户改为直接发送消息，卡片会过期，消息仍会像以前一样唤醒智能体。

## 占位符

- `{{agentName}}` → 智能体选择的名称。如果智能体没有名称，问候语会自然省略姓名（“我是你的首位智能体队友”），与以往行为一致。用于 `greeting.md` 和 `chief-of-staff/AGENTS.md`。
- `{{organizationName}}` → 组织（公司）名称。用于 `chief-of-staff/AGENTS.md`。
- `{{proposalMode}}`（仅在 `brief.md` 中）→ `confirmation` 或 `plan`，由 `enableFirstTaskPlanProposal` 开关决定。技能包含两种模式的策略；任务描述中不会展开策略文本。

## 开关

`enableFirstTaskPlanProposal`（Settings → Experimental，级别 `preference`，云端和自托管默认均为**关闭**）。标题：“首个任务：通过计划文档提出方案”。开启后，首个任务调用会为单任务路径选择 `plan` 模式，使幕僚长编写简短计划文档并发布复选卡，而不是单张确认卡。创建路由只在首个任务创建时读取一次该开关；之后更改开关不会影响已有的首个任务。

## 技能分配与调用

公司技能服务会以规范键 `paperclipai/paperclip/first-task` 和运行时名称 `first-task` 导入 `skills/first-task/SKILL.md`。对于董事会创建、且使用支持技能的适配器（包括 Codex 和 Claude）的 `onboardingFirstAgent` 智能体，智能体创建和招聘路由会在五项核心技能之外分配此技能。普通 CEO 和其他智能体不会自动获得它。

隐藏描述要求智能体在回复前阅读并遵循此技能，包括该任务后续被唤醒时。用户无需输入斜杠命令。原生 Codex 会将所选技能作为结构化技能输入发送。原生 ACPX Claude 会在首次和恢复的轮次中，通过原生 `/first-task` 命令调用已分配的技能，并将完整的任务/唤醒信封作为参数。旧版适配器仍会遵循 brief 中“阅读已安装技能”的指示。这些方式都不会额外启动一次模型运行。此技能仅适用于调用它的引导任务，不适用于分配给该智能体的所有任务。固定问候语、开场卡片和首次不唤醒的行为均保持不变。

## 更新

1. **本地修改在下次服务器重启后生效，云端修改在下次发布后生效。** 文件从磁盘读取（构建时打包到 `dist/`），不会写入 TypeScript，因此只需编辑 Markdown 并重启或发布即可。
2. **任务描述和角色设定采用快照。** 现有首个任务会保留创建时的描述；现有首位智能体会保留写入的角色设定（可在每个智能体的 Instructions 中编辑）。此更改不会迁移现有首个任务，也不会为现有智能体分配技能。
3. **技能文本按常规内置技能刷新流程更新。** 已分配未固定版本 `first-task` 技能的智能体，会通过公司清单获得当前内置内容。因此，其策略可以独立于已保存的调用内容更新；提案模式仍以任务中保存的值为准。
