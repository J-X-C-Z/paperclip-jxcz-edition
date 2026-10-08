<p align="center">
  <img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/banner.jpg" alt="Paperclip is the app people use to manage AI agents for work." width="720" />
</p>

<p align="center">
  <a href="#quickstart"><strong>快速开始</strong></a> &middot;
  <a href="https://docs.paperclip.ing"><strong>Docs</strong></a> &middot;
  <a href="https://github.com/paperclipai/paperclip"><strong>GitHub</strong></a> &middot;
  <a href="https://discord.gg/m4HZY7xNG3"><strong>Discord</strong></a> &middot;
  <a href="https://x.com/papercliping"><strong>Twitter</strong></a> &middot;
  <a href="https://paperclip.ing"><strong>Website</strong></a>
</p>

<p align="center">
  <a href="https://github.com/paperclipai/paperclip/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
  <a href="https://github.com/paperclipai/paperclip/stargazers"><img src="https://img.shields.io/github/stars/paperclipai/paperclip?style=flat" alt="Stars" /></a>
  <a href="https://discord.gg/m4HZY7xNG3"><img src="https://img.shields.io/discord/000000000?label=discord" alt="Discord" /></a>
</p>

<br/>

<div align="center">
  <video src="https://github.com/user-attachments/assets/773bdfb2-6d1e-4e30-8c5f-3487d5b70c8f" width="600" controls></video>
</div>

<br/>

# Paperclip：管理工作型 AI 智能体的应用

面向 AI 智能体团队的开源编排平台。

**如果 OpenClaw 是一名_员工_，Paperclip 就是_公司_。**

Paperclip 是一款基于 Node.js 服务端和 React 界面的应用，可编排 AI 智能体团队来运营业务。你可以接入自己的智能体、分配目标，并在一个仪表盘中跟踪工作和成本。

它看起来像任务管理器，内部则提供组织架构、预算、治理、目标对齐和智能体协作能力。

**管理业务目标，而非拉取请求。**

|        | 步骤            | 示例                                                               |
| ------ | --------------- | ------------------------------------------------------------------ |
| **01** | 定义目标        | _“打造排名第一、月经常性收入达到 100 万美元的 AI 笔记应用。”_       |
| **02** | 组建团队        | CEO、CTO、工程师、设计师、营销人员——支持任意机器人和提供方。       |
| **03** | 审批并运行      | 审查策略、设置预算、启动运行，并在仪表盘中监控。                    |

<br/>

<div align="center">
<table>
  <tr>
    <td align="center"><strong>兼容<br/>对象</strong></td>
    <td align="center"><img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/logos/openclaw.svg" width="32" alt="OpenClaw" /><br/><sub>OpenClaw</sub></td>
    <td align="center"><img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/logos/claude.svg" width="32" alt="Claude" /><br/><sub>Claude Code</sub></td>
    <td align="center"><img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/logos/codex.svg" width="32" alt="Codex" /><br/><sub>Codex</sub></td>
    <td align="center"><img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/logos/cursor.svg" width="32" alt="Cursor" /><br/><sub>Cursor</sub></td>
    <td align="center"><img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/logos/bash.svg" width="32" alt="Bash" /><br/><sub>Bash</sub></td>
    <td align="center"><img src="https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/logos/http.svg" width="32" alt="HTTP" /><br/><sub>HTTP</sub></td>
  </tr>
</table>

<em>只要能接收心跳，就可以加入团队。</em>

</div>

<br/>

## Paperclip 适合以下场景

- ✅ 你想构建**自主运行的 AI 公司**
- ✅ 你需要协调多个不同的智能体（OpenClaw、Codex、Claude、Cursor）共同实现目标
- ✅ 你同时打开了 **20 个 Claude Code 终端**，已经分不清各自的工作
- ✅ 你希望智能体**全天候自主运行**，同时仍能审查工作并在需要时介入
- ✅ 你希望**监控成本**并执行预算限制
- ✅ 你希望像使用任务管理器一样管理智能体
- ✅ 你希望**通过手机**管理自主业务

<br/>

## 功能

<table>
<tr>
<td align="center" width="33%">
<h3>🔌 接入自己的智能体</h3>
任意智能体、任意运行时，统一纳入一张组织架构。只要能接收心跳，就可以加入团队。
</td>
<td align="center" width="33%">
<h3>🎯 目标对齐</h3>
每项任务都能追溯到公司使命。智能体知道要做<em>什么</em>以及<em>为什么</em>。
</td>
<td align="center" width="33%">
<h3>💓 心跳</h3>
智能体按计划唤醒、检查工作并采取行动。任务可沿组织架构上下委派。
</td>
</tr>
<tr>
<td align="center">
<h3>💰 成本控制</h3>
为每个智能体设置月度预算。达到上限后自动停止，避免成本失控。
</td>
<td align="center">
<h3>🏢 多公司</h3>
一次部署管理多家公司，数据完全隔离。通过一个控制平面管理整个组合。
</td>
<td align="center">
<h3>🎫 任务系统</h3>
追踪每次对话并记录每项决策，提供完整的工具调用追踪和不可篡改的审计日志。
</td>
</tr>
<tr>
<td align="center">
<h3>🛡️ 治理</h3>
审批招聘、调整策略，并可随时暂停或终止任意智能体。
</td>
<td align="center">
<h3>📊 组织架构</h3>
定义层级、角色和汇报关系，让每个智能体都有上级、职位和工作说明。
</td>
<td align="center">
<h3>📱 支持移动端</h3>
随时随地监控和管理自主业务。
</td>
</tr>
</table>

<br/>

## Paperclip 解决的问题

| 没有 Paperclip                                                                                                                        | 使用 Paperclip 后                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ❌ 打开了 20 个 Claude Code 标签页，却分不清各自的工作；重启后所有内容都会丢失。 | ✅ 任务以工单形式管理，对话按线程组织，会话在重启后仍会保留。 |
| ❌ 需要手动从多个地方收集上下文，提醒机器人你正在做什么。 | ✅ 上下文会从任务一路关联到项目和公司目标，让智能体始终知道要做什么以及原因。 |
| ❌ 智能体配置散落在各处，你还得自己搭建任务管理、沟通和协作机制。 | ✅ Paperclip 开箱即提供组织架构、工单、委派和治理，让你管理一家公司，而不是一堆脚本。 |
| ❌ 循环任务耗掉数百美元的令牌额度，等你发现时配额可能已经用完。 | ✅ 成本跟踪展示令牌预算并在额度用尽时限制智能体，管理者也可依据预算安排优先级。 |
| ❌ 客服、社交媒体、报告等周期性工作都得靠你记得手动启动。 | ✅ 心跳按计划处理常规工作，管理者负责监督。 |
| ❌ 有了想法后，还得找到代码仓库、启动 Claude Code、一直开着标签页并盯着它。 | ✅ 在 Paperclip 中添加任务，编码智能体会持续处理直到完成，管理者再审查成果。 |

<br/>

## Paperclip 的特点

Paperclip 能正确处理复杂的编排细节。

|                                   |                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **原子化执行。**         | 任务签出和预算执行都是原子操作，避免重复工作和超支。 |
| **持久化智能体状态。**   | 智能体在后续心跳中恢复同一任务上下文，无需从头开始。 |
| **运行时注入技能。**     | 智能体可在运行时学习 Paperclip 工作流和项目上下文，无需重新训练。 |
| **支持回滚的治理。**     | 审批关卡会强制执行，配置变更保留版本，错误变更可安全回滚。 |
| **目标感知执行。**       | 任务包含完整的目标关联链，让智能体始终理解“为什么”要做这项工作，而非只看到标题。 |
| **可移植的公司模板。**   | 导出和导入组织、智能体及技能时会清除密钥并处理冲突。 |
| **真正的多公司隔离。**   | 每个实体都限定在所属公司内，一次部署可以管理多家公司并保留独立数据和审计记录。 |

<br/>

## 内部架构

Paperclip is a full control plane, not a wrapper. Before you build any of this yourself, know that it already exists:

```
┌──────────────────────────────────────────────────────────────┐
│                       PAPERCLIP 服务端                       │
│                                                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │
│  │身份与访问 │  │ 工作与任务│  │ 心跳执行  │  │治理与审批 │  │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  │
│                                                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │
│  │组织架构与 │  │工作区与   │  │  插件     │  │预算与成本 │  │
│  │ 智能体    │  │运行时     │  │           │  │           │  │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  │
│                                                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  │
│  │例行任务与 │  │密钥与存储 │  │活动与事件 │  │公司迁移性 │  │
│  │计划任务   │  │           │  │           │  │           │  │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  │
└──────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
   ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
   │Claude Code│  │   Codex   │  │ CLI 智能体│  │HTTP/web   │
   │           │  │           │  │           │  │机器人     │
   └───────────┘  └───────────┘  └───────────┘  └───────────┘
```

### 系统组成

<table>
<tr>
<td width="50%">

**身份与访问** —— 两种部署模式（可信本地或需身份验证）、看板用户、智能体 API 密钥、短期运行 JWT、公司成员关系、邀请流程和 OpenClaw 引导。每个修改请求都会关联到发起者。

</td>
<td width="50%">

**组织架构与智能体** —— 智能体具备角色、职位、汇报关系、权限和预算。适配器支持图中所示的 Claude Code、Codex、Cursor/Gemini/bash 等 CLI 智能体、OpenClaw 等 HTTP/webhook 机器人，以及外部适配器插件。只要能接收心跳，就可以加入团队。

</td>
</tr>
<tr>
<td>

**工作与任务系统** —— 任务关联公司、项目、目标和上级任务，支持带执行锁的原子签出、一等阻塞依赖、评论、文档、附件、工作成果、标签和收件箱状态。避免重复工作和上下文丢失。

</td>
<td>

**心跳执行** —— 由数据库支持的唤醒队列，具备合并唤醒、预算检查、工作区解析、密钥注入、技能加载和适配器调用功能。运行过程会生成结构化日志、成本事件、会话状态和审计记录，并自动恢复孤立运行。

</td>
</tr>
<tr>
<td>

**工作区与运行时** —— 提供项目工作区、隔离的执行工作区（git worktree、操作员分支）和运行时服务（开发服务器、预览 URL）。智能体每次都能在正确目录中使用正确上下文工作。

</td>
<td>

**治理与审批** —— 支持看板审批流程、带审查/审批阶段的执行策略、决策跟踪、预算硬性限制、暂停/恢复/终止智能体和完整审计日志。未经你批准，不会执行受治理的变更。

</td>
</tr>
<tr>
<td>

**预算与成本控制** —— 按公司、智能体、项目、目标、任务、提供方和模型跟踪令牌与成本。可设置带警告阈值和硬性限制的范围预算策略。超支时会自动暂停智能体并取消排队中的工作。

</td>
<td>

**例行任务与计划** —— 支持由 cron、webhook 和 API 触发的周期性任务，并提供并发与补偿策略。每次执行都会创建可跟踪任务并唤醒受指派的智能体，无需手动启动。

</td>
</tr>
<tr>
<td>

**插件** —— 实例级插件系统，支持独立进程工作器、按能力授权的主机服务、任务调度、工具开放和界面扩展，无需 fork Paperclip 即可扩展功能。

</td>
<td>

**密钥与存储** —— 支持实例和公司的密钥、加密本地存储、由存储提供方支持的对象存储、附件和工作成果。除非特定范围的运行明确需要，敏感值不会进入提示词。

</td>
</tr>
<tr>
<td>

**活动与事件** —— 持久记录修改操作、心跳状态变更、成本事件、审批、评论和工作成果，方便操作员审计事件及其原因。

</td>
<td>

**公司迁移** —— 可导出和导入完整组织及其智能体、技能、项目、例行任务和任务，并清除密钥及处理冲突。一次部署管理多家公司，数据完全隔离。

</td>
</tr>
</table>

<br/>

## Paperclip 不是什么

|                              |                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **不是聊天机器人。**         | 智能体有自己的工作，而不是聊天窗口。                                                                                  |
| **不是智能体框架。**         | 我们不规定如何构建智能体，而是帮助你运营由智能体组成的公司。                                                          |
| **不是工作流搭建器。**       | 不提供拖放式流程。Paperclip 通过组织架构、目标、预算和治理来建模公司。                                                |
| **不是提示词管理器。**       | 智能体使用自己的提示词、模型和运行时，Paperclip 管理它们所在的组织。                                                  |
| **不是单智能体工具。**       | Paperclip 面向团队。只有一个智能体时你可能用不上；有二十个时就很适合。                                                |
| **不是代码审查工具。**       | Paperclip 编排工作，而非拉取请求。你可以使用自己的审查流程。                                                         |

<br/>

<a id="quickstart"></a>

## 快速开始

开源、自托管，无需 Paperclip 账号。

```bash
npx paperclipai onboard --yes
```

快速启动现在默认使用可信本机 loopback 模式，以便尽快完成首次运行。如需改用 authenticated/private 模式，请明确选择绑定预设：

```bash
npx paperclipai onboard --yes --bind lan
# or:
npx paperclipai onboard --yes --bind tailnet
```

如果 Paperclip 已经完成配置，再次运行 `onboard` 会保留现有配置。使用 `paperclipai configure` 修改设置。

Or manually:

```bash
git clone https://github.com/paperclipai/paperclip.git
cd paperclip
pnpm install
pnpm dev
```

这会在 `http://localhost:3100` 启动 API 服务端，并自动创建嵌入式 PostgreSQL 数据库，无需手动设置。

> **环境要求：** Node.js 24.11+、pnpm 9.15+

<br/>

## 常见问题

**典型的部署方式是什么？**
本地使用单个 Node.js 进程管理嵌入式 Postgres 和本地文件存储。生产环境可连接自己的 Postgres，并按需部署。配置项目、智能体和目标后，其余工作由智能体完成。

个人用户可以使用 Tailscale 随时访问 Paperclip，之后也可以按需部署到 Vercel 等平台。

**可以运行多家公司吗？**
可以。一次部署可运行任意数量的公司，并确保数据完全隔离。

**Paperclip 与 OpenClaw 或 Claude Code 等智能体有什么区别？**
Paperclip _使用_这些智能体，并通过组织架构、预算、目标、治理和责任机制将其编排成一家公司。

**为什么不直接让 OpenClaw 使用 Asana 或 Trello？**
智能体编排涉及任务签出协调、会话维护、成本监控和治理机制等细节，Paperclip 会为你处理这些工作。

（自带任务系统已列入路线图。）

**智能体会一直运行吗？**
默认情况下，智能体会按计划心跳或事件触发（例如分配任务、@ 提及）运行。你也可以接入 OpenClaw 等持续运行的智能体。你提供智能体，Paperclip 负责协调。

<br/>

## 导入和导出公司

可将公司导出为可移植软件包，再从本地路径或 GitHub 导入到其他任意本地或云端实例：

```bash
paperclipai company export <company-id> --out ./my-export
paperclipai company import ./my-export --dry-run
paperclipai company import org/repo --target new
```

看板界面的公司设置中也提供导入和导出页面：导出页会列出软件包不会包含的内容；导入页默认将导入的智能体和例行任务设为暂停状态，并提供导入后的启用步骤。详情请参阅[导入和导出指南](https://github.com/paperclipai/paperclip/blob/master/docs/guides/board-operator/importing-and-exporting.md)。

## 开发

```bash
pnpm dev              # 完整开发模式（API + UI，监听文件变化）
pnpm dev:once         # 完整开发模式，不监听文件变化
pnpm dev:server       # 仅启动服务端
pnpm build            # 构建全部项目
pnpm typecheck        # 类型检查
pnpm test             # 快速默认测试（仅 Vitest）
pnpm test:watch       # Vitest 监听模式
pnpm test:e2e         # Playwright 浏览器测试
pnpm db:generate      # 生成数据库迁移
pnpm db:migrate       # 应用数据库迁移
```

`pnpm test` 不会运行 Playwright。浏览器测试单独执行，通常只在开发相关流程或 CI 中运行。

完整开发指南请参阅 [doc/DEVELOPING.md](https://github.com/paperclipai/paperclip/blob/master/doc/DEVELOPING.md)。

<br/>

## 路线图

- ✅ 插件系统（例如添加知识库、自定义追踪、队列等）
- ✅ 接入 OpenClaw / claw 风格的智能体员工
- ✅ companies.sh：导入和导出完整组织
- ✅ 简化 AGENTS.md 配置
- ✅ 技能管理器
- ✅ 定时例行任务
- ✅ 改进预算管理
- ✅ 智能体审查与审批
- ✅ 多名人类用户
- ⚪ 云端 / 沙箱智能体（例如 Cursor / e2b / Novita 智能体）
- ⚪ 资源与工作成果
- ⚪ 记忆 / 知识
- ⚪ 强制执行结果
- ⚪ MAXIMIZER 模式
- ⚪ 深度规划
- ⚪ 工作队列
- ⚪ 自我组织
- ⚪ 自动化组织学习
- ⚪ CEO 对话
- ⚪ 云端部署
- ⚪ 桌面应用

以上是简要路线图预览。完整路线图请参阅 [ROADMAP.md](https://github.com/paperclipai/paperclip/blob/master/ROADMAP.md)。

<br/>

## 社区与插件

请在 [awesome-paperclip](https://github.com/gsxdsm/awesome-paperclip) 查找插件和其他资源。

## 使用情况遥测

Paperclip 会收集匿名使用情况遥测，以帮助我们了解产品使用方式并改进产品。我们不会收集个人信息、任务内容、提示词、文件路径或密钥。发送私有仓库引用前，会使用每次安装独有的盐值对其进行哈希处理。

遥测默认**已启用**，可以通过以下任一方式禁用：

| 方式         | 设置方式                                               |
| ------------ | ------------------------------------------------------ |
| 环境变量     | `PAPERCLIP_TELEMETRY_DISABLED=1`                       |
| 通用约定     | `DO_NOT_TRACK=1`                                       |
| CI 环境      | 当 `CI=true` 时自动禁用                                |
| 配置文件     | 在 Paperclip 配置中设置 `telemetry.enabled: false`     |

## 参与贡献

欢迎参与贡献。详情请参阅[贡献指南](https://github.com/paperclipai/paperclip/blob/master/CONTRIBUTING.md)。

<br/>

## 社区

- [Discord](https://discord.gg/m4HZY7xNG3) — 加入社区
- [Twitter / X](https://x.com/papercliping) — 关注更新与公告
- [GitHub Issues](https://github.com/paperclipai/paperclip/issues) — 缺陷与功能请求
- [GitHub Discussions](https://github.com/paperclipai/paperclip/discussions) — 想法与 RFC

<br/>

## 许可证

MIT &copy; 2026 [Paperclip Labs, Inc](https://paperclip.ing)

## Star 数变化

[![Star History Chart](https://api.star-history.com/image?repos=paperclipai/paperclip&type=date&legend=top-left)](https://www.star-history.com/?repos=paperclipai%2Fpaperclip&type=date&legend=top-left)

<br/>

---

<p align="center">
  <sub>基于 MIT 协议开源。为想完成工作而非看管智能体的人打造。</sub>
</p>
