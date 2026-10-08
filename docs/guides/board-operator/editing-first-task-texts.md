---
title: Editing the First-Task Texts
summary: Change the welcome, instructions, and proposal style for new organizations
---

## 简体中文

新公司首次任务的文本模板位于 `server/src/onboarding-assets/first-task/`，使用 Markdown，因此维护者无需改 TypeScript 即可调整。文件包括 `greeting.md`（欢迎语）、`brief.md`（隐藏的 `/first-task` 技能调用，含 `{{proposalMode}}`）、`skills/first-task/SKILL.md`（首次任务指令）、`opening-question.json`（开场问题卡）、`chief-of-staff/AGENTS.md`（首位 agent 角色说明）和 `README.md`（维护说明）。模板可用 `{{agentName}}`、`{{organizationName}}` 和 `{{proposalMode}}`；proposal mode 为 `confirmation` 或 `plan`。

### 首次任务流程

服务端发送欢迎语和含两个选项的开场卡；用户回复卡片或发送消息前不会启动工作。首位 agent 会自动获得 `first-task` skill，隐藏任务描述会要求它遵循该 skill，用户无需输入 `/first-task`。该 skill 只作用于 onboarding 首任务及其后续回复。

- **Interview me**：agent 在一张卡片中提出 3–4 个问题，然后建议计划和团队。
- **I have a task in mind**：用户输入即为任务；信息足够清楚时立即提出方案，否则先问 2–3 个澄清问题。
- 直接输入普通消息也会作为任务处理。

只有用户接受确认卡或勾选卡片后，agent 才能创建招聘或任务。

### 修改与提案方式

用 GitHub 网页编辑器或本地修改 Markdown，提交 PR 并合并。本地实例在下次服务重启后加载，Cloud 租户会在下个版本更新。既有首任务的描述和首位 agent 的指令文件不会被迁移；新 onboarding agent 会自动分配 skill，现有 agent 不会迁移。可在 app 的 **Instructions** 修改现有 agent 的 persona 副本。已分配且未 pin 的 `first-task` skill 会按正常 bundled-skill 刷新收到更新；任务中保存的 proposal mode 不会改变。

在 **Settings > Experimental** 找到 **First task: propose with a plan document**（key：`enableFirstTaskPlanProposal`，默认关闭）。关闭时 chief of staff 用一张确认卡回复单任务请求；开启时会撰写简短 plan 文档并附复选卡。Paperclip 只在创建公司首任务时读取该设置，之后修改不会改变已有任务。

---

The text for a new organization's first task lives in `server/src/onboarding-assets/first-task/`. It is plain Markdown, so maintainers can change it without editing TypeScript.

## Files and placeholders

| File | Purpose |
| --- | --- |
| `greeting.md` | The welcome the user sees. |
| `brief.md` | The hidden `/first-task` skill invocation. Contains `{{proposalMode}}`. |
| `skills/first-task/SKILL.md` | The first-task instructions, including both proposal modes. |
| `opening-question.json` | The opening card: its prompt and two options. |
| `chief-of-staff/AGENTS.md` | The first agent's chief-of-staff persona. |
| `README.md` | A maintainer reference for the files, placeholders, toggle, and update behavior. |

The templates support `{{agentName}}`, `{{organizationName}}`, and `{{proposalMode}}`. Paperclip fills them when it creates the first agent and first task. The proposal mode is `confirmation` or `plan`; the full policy lives in the skill.

## How the first-task flow works

The server posts the greeting and an opening card with two options. Nothing runs until the user answers the card or writes a message.

The first agent receives the `first-task` skill automatically. The first task's hidden description tells it to read and follow that skill; the user does not need to type `/first-task`. The skill also applies to later replies on that onboarding task, but not to the agent's other tasks.

- **Interview me:** the agent asks 3–4 questions in one card, then proposes a plan and a team.
- **I have a task in mind:** the typed text is the task. When it is clear enough, the agent proposes right away. Otherwise it asks 2–3 clarifying questions first.
- A plain message instead of an answer counts as a task.

The agent may create hires or tasks only after the user accepts a confirmation or checkbox card.

## Apply an edit

Edit the Markdown with GitHub's web editor or locally, open a pull request, and merge it. A local instance loads the change after its next server restart; Cloud tenants receive it with the next release.

An existing first task keeps its stored description, and an existing first agent keeps its instruction file. The skill is assigned automatically to new onboarding agents; existing agents are not migrated. You can edit the agent's copy of its persona in the app under **Instructions**.

Skill edits follow normal bundled-skill refresh: agents already assigned the unpinned `first-task` skill receive its updated policy. The proposal mode saved in each task stays the same.

## Choose the proposal form

Open **Settings > Experimental** and find **First task: propose with a plan document**. Its setting key is `enableFirstTaskPlanProposal`, and it is off by default.

- **Off:** the chief of staff answers a single-task request with one confirmation card.
- **On:** the chief of staff writes a short plan document and adds a checkbox card.

Paperclip reads this setting once, when it creates an organization's first task. Changing it later does not alter an existing first task.
