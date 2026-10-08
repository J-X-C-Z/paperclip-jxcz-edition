---
title: Execution Workspaces And Runtime Services
summary: How project runtime configuration, execution workspaces, and issue runs fit together
---

## 简体中文

Paperclip 使用工作区命令模型管理项目运行环境：`Services` 是受监督的长期运行命令，`Jobs` 是运行一次后退出的命令。高级配置仍可直接写 runtime JSON，但它不再是主要的操作模型。

### 项目配置与命令控制

项目 workspace 可定义该 checkout 可用的 services 和 jobs；这是 execution workspace 可继承的默认配置。仅定义配置不会启动命令。项目和 execution workspace 都可在各自 UI 中手动启动/停止 service、按需运行 job。Heartbeat 开始 issue run 时，会自动启动 desired state 解析为 `running` 的 services（默认状态）；匹配已有 reuse key 的 service 会复用而不重启。将 desired state 设为 `stopped` 或 `manual` 可让 service 只由 UI 控制。服务器启动时不会自动重启 workspace services。

### Execution Workspace 与任务

Execution workspace 隔离项目主 workspace 的代码和运行状态，拥有自己的 checkout、branch 和 runtime 实例；默认可继承项目 runtime 配置，也可单独覆盖。继承配置定义有哪些命令及其启动方式，但运行中的进程始终属于具体 execution workspace。Issue 可新建隔离 workspace，也可选择复用；多个 issue 也可共享一个 workspace，以共用 branch 和运行中的 services。任务 run 会启动 desired state 为 `running` 的 services；run 结束后不主动停止，除非 service 是 ephemeral 且没有其他 run 持有 lease。Execution workspace 会持续保留，直至人工关闭；关闭时会停止 services 并在允许时清理 workspace 文件。共享项目主 checkout 的清理会比隔离 workspace 更谨慎。

Heartbeat 的 workspace 解析过程：解析基础 workspace；创建或复用 worktree；保存路径、ref 和配置；把代码 workspace 交给 agent；然后调用 `ensureRuntimeServicesForRun` 启动服务。如果配置了尚未运行的 lazy runtime provision 命令，会先运行一次。

### 浏览器可访问的 OAuth 回调

由 Paperclip 管理且自身运行 Paperclip 的 service，需要一个 canonical origin 用于 Better Auth 和工具 OAuth 回调。优先顺序为 service/runtime 配置（例如 `PAPERCLIP_PUBLIC_URL` 或 `BETTER_AUTH_URL`）、实例 auth 公网 base URL、最后才是 `expose.urlTemplate` 提供的低优先级 fallback。它必须是操作员浏览器实际使用的地址；非 loopback callback 必须使用 HTTPS。本机浏览器验收可用 `http://127.0.0.1:45439` 等 loopback HTTP。workspace 数据生成的 hostname 必须落在模板指定的稳定域名后缀中。Bind address、仅内网单标签名、保留/无法解析的域名以及非 loopback HTTP 都会使 service 启动失败并给出配置提示。

若 proxy 或 tailnet 对外提供访问，请将 readiness 检查和浏览器 exposure 分开配置。每个隔离 worktree 使用不同可访问 hostname/origin，不能指向父实例 origin。启动后在验收所用浏览器中打开 service URL，并检查 `GET /api/tools/oauth/client-metadata` 的 `redirect_uris` 使用该 origin 和 `/api/tools/oauth/callback`。

### Lazy runtime provisioning

数据库 seed、缓存预热等重型一次性准备可延迟到第一次启动 runtime service。可在 Project properties → execution workspace 配置 runtime provision command，或在 workspace 的 Configuration 覆盖。设置后 workspace 准备阶段保持轻量，命令会在该 workspace 第一次启动 service 前准确运行一次；留空则沿用 workspace provisioning 阶段立即准备的旧流程。结果显示在 workspace 详情：Deferred、Provisioned at 时间或 Provisioning failed（附运行日志）。运行中 service 会先显示 Provisioning… 状态。

### 私有仓库与仅仓库项目

项目 workspace 可只设置 `Repo URL` 而无本地路径。服务端会按需 clone 到受管目录；隔离 `git_worktree` run 会在准备 worktree 前 `git fetch` 更新 base ref。以上操作发生在服务端，不运行于 agent 进程，因此不使用 agent 级凭证环境变量。私有 GitHub 仓库应在 Settings → Secrets 保存名为 `GITHUB_TOKEN`、`GH_TOKEN` 或 `PAPERCLIP_GITHUB_TOKEN` 的 company secret（按此顺序查找）。无匹配 secret 时，单租户自托管实例会回退至 server 环境变量，再尝试匿名访问。此凭证仅适用于 `https://github.com/...`；SSH、GitHub Enterprise 和其他 provider 仍使用服务端 git 凭证配置；URL 自带凭证不会被覆盖。Token 通过一次性 credential helper 传递，不会进入命令行、URL 或磁盘，每次读取都会记录 secret access event。

该服务端 clone 凭证与 agent push 凭证分开。Agent 推送 branch 或 PR 时，仍需要在 agent/project 范围将 `GH_TOKEN` 或 `GITHUB_TOKEN` 绑定到 agent 进程。

### 跨 run 持久化约定

Run 之间只通过本地 execution workspace cwd 传递代码，不依赖 Git remote。准备阶段通过 SSH 将本地 worktree 打包到 run 的远端目录；适配器在结束时把远端新 commit restore 回本地 worktree。Runtime 不得执行 `git push`，也不得假设 remote 存在。Restore 失败会使整个 run 报错并记录 `workspace_finalize=failed`；依赖任务的唤醒会等待下一次成功 finalize。

当前实现中，项目命令配置是 execution workspace UI 控件的 fallback；workspace override 单独保存。Heartbeat 自动启动 desired state 为 `running` 的服务，lazy provision 最多运行一次；服务器启动不恢复服务。

---

This guide documents the intended runtime model for projects, execution workspaces, and issue runs in Paperclip.

Paperclip now presents this as a workspace-command model:

- `Services` are long-running commands that stay supervised.
- `Jobs` are one-shot commands that run once and exit.
- Raw runtime JSON is still available for advanced config, but it is no longer the primary mental model.

## Project runtime configuration

You can define how to run a project on the project workspace itself.

- Project workspace runtime config describes the services and jobs available for that project checkout.
- This is the default runtime configuration that child execution workspaces may inherit.
- Defining the config does not start anything by itself.

## Runtime control: manual and heartbeat-driven

Workspace commands can be controlled manually from the UI, and heartbeat runs also start services automatically.

- Project workspace services are started and stopped from the project workspace UI, and project jobs can be run on demand there.
- Execution workspace services are started and stopped from the execution workspace UI, and execution-workspace jobs can be run on demand there.
- Heartbeat runs also auto-start the workspace's runtime services at the beginning of an issue run. `ensureRuntimeServicesForRun` (`server/src/services/workspace-runtime.ts`, called from `server/src/services/heartbeat.ts`) starts each service whose desired state resolves to `running` — which is the default when no explicit per-service desired state is set. A running service that matches an existing reuse key is reused rather than restarted.
- You can opt a service out of that auto-start by setting its desired state to `stopped`/`manual` in the runtime config; those services stay UI-controlled.
- Paperclip does not automatically restart workspace services on server boot — services only come back up when the next run (or a manual start) brings them up.

## Execution workspace inheritance

Execution workspaces isolate code and runtime state from the project primary workspace.

- An isolated execution workspace has its own checkout path, branch, and local runtime instance.
- The runtime configuration may inherit from the linked project workspace by default.
- The execution workspace may override that runtime configuration with its own workspace-specific settings.
- The inherited configuration answers "which commands exist and how to run them", but any running service process is still specific to that execution workspace.

## Issues and execution workspaces

Issues are attached to execution workspace behavior, not to automatic runtime management.

- An issue may create a new execution workspace when you choose an isolated workspace mode.
- An issue may reuse an existing execution workspace when you choose reuse.
- Multiple issues may intentionally share one execution workspace so they can work against the same branch and running runtime services.
- Running an issue auto-starts the workspace's `running`-desired runtime services for the duration of the run (see "Runtime control" above); it does not stop them when the run ends unless they are ephemeral and no other run holds a lease.

## Execution workspace lifecycle

Execution workspaces are durable until a human closes them.

- The UI can archive an execution workspace.
- Closing an execution workspace stops its runtime services and cleans up its workspace artifacts when allowed.
- Shared workspaces that point at the project primary checkout are treated more conservatively during cleanup than disposable isolated workspaces.

## Resolved workspace logic during heartbeat runs

Heartbeat resolves a workspace for the run (code location and session continuity) and also brings up that workspace's runtime services.

1. Heartbeat resolves a base workspace for the run.
2. Paperclip realizes the effective execution workspace, including creating or reusing a worktree when needed.
3. Paperclip persists execution-workspace metadata such as paths, refs, and provisioning settings.
4. Heartbeat passes the resolved code workspace to the agent run.
5. Heartbeat calls `ensureRuntimeServicesForRun` to start the workspace's `running`-desired runtime services, running the lazy runtime provision command first if one is configured and has not yet run (see "Lazy runtime provisioning" below).

## Browser-reachable origins for OAuth QA

A managed service that runs Paperclip itself needs one canonical origin for Better Auth and tool OAuth callbacks. Paperclip resolves that origin in this order:

1. Explicit service/runtime configuration such as `PAPERCLIP_PUBLIC_URL` or `BETTER_AUTH_URL`.
2. An explicit instance auth public base URL.
3. The managed service's rendered `expose.urlTemplate`, injected as a low-priority runtime fallback.

The exposed URL must describe the route the operator's browser actually uses. Non-loopback callbacks require HTTPS. Loopback HTTP such as `http://127.0.0.1:45439` is supported for local browser QA. A non-loopback hostname rendered from workspace data must remain inside the stable domain suffix configured by `expose.urlTemplate`; branch names cannot replace that domain. Bind addresses, internal-only single-label names such as `paperclip-dev`, reserved/non-resolving names, and non-loopback HTTP origins fail service startup with configuration guidance instead of silently producing an unusable redirect URI.

Keep readiness and browser exposure separate when a proxy or tailnet route fronts the process:

```json
{
  "name": "paperclip-dev",
  "command": "pnpm dev --bind lan",
  "port": { "type": "auto" },
  "readiness": {
    "type": "http",
    "urlTemplate": "http://127.0.0.1:{{port}}"
  },
  "expose": {
    "type": "url",
    "urlTemplate": "https://{{workspace.branchName}}.dev.example.com"
  }
}
```

Use a distinct reachable hostname (or other distinct origin) per isolated worktree. Do not point multiple worktree runtimes at the parent instance's origin. After startup, open the service URL in the same browser session used for QA and verify `GET /api/tools/oauth/client-metadata`; its `redirect_uris` entry should use that service origin and `/api/tools/oauth/callback`.

## Lazy runtime provisioning

Some workspaces need heavy one-time setup — seeding a database, warming caches — before their runtime services can start. That work can be deferred to the first runtime-service start instead of running eagerly during workspace preparation.

- Configure a **runtime provision command** on the project's workspace strategy (Project properties → execution workspace), or override it per execution workspace on the workspace's Configuration tab.
- When set, workspace preparation stays lean and the command runs exactly once, immediately before the first runtime-service start for that workspace. Leaving it empty keeps the legacy eager path (all setup during workspace provisioning).
- The command's outcome is recorded as a `workspace_runtime_provision` operation on the execution workspace and surfaced on the workspace detail page:
  - **Deferred** — configured but not yet run (no runtime service has started yet).
  - **Provisioned at &lt;time&gt;** — the command completed successfully.
  - **Provisioning failed** — the command failed; the workspace detail links to the runtime logs for the failing operation.
- While the command runs, the runtime service shows a **Provisioning…** state before it transitions to starting/running.

## Private repositories and repo-only project workspaces

A project workspace can be **repo-only**: a `Repo URL` with no local path. The server then
materializes a managed checkout on demand (`git clone` into a managed directory) and, for
isolated `git_worktree` runs, refreshes the base ref (`git fetch`) before preparing each
worktree. Both operations run on the server, outside any agent process — so agent-scoped
credential env bindings do not apply to them.

For **private GitHub repositories**, store a token as a **company secret** named one of
`GITHUB_TOKEN`, `GH_TOKEN`, or `PAPERCLIP_GITHUB_TOKEN` (checked in that order; Settings →
Secrets). The server resolves it per run and authenticates managed clones and base-ref
fetches with it. Details and caveats:

- Scope: only `https://github.com/...` repo URLs are authenticated this way. SSH URLs, GitHub
  Enterprise hosts, and other providers keep ambient behavior (system git config/credential
  helpers on the server host). URLs that embed their own credentials are never overridden.
- Fallback: with no matching company secret, the server falls back to a `GITHUB_TOKEN` or
  `GH_TOKEN` variable in the **server process environment** (useful for self-hosted single-tenant
  deployments), then to unauthenticated access — public repos keep working with no setup.
- The token never appears in command lines, URLs, or on disk; it is passed to git through an
  ephemeral credential helper. Each resolution is recorded as a secret access event.
- This is separate from the **agent push credential**: agents pushing branches/PRs still need
  `GH_TOKEN`/`GITHUB_TOKEN` bound at agent or project scope (see
  [deploy/secrets](../../deploy/secrets.md)) so the token reaches the agent process env. The
  same company secret can back both uses via a binding.

## Cross-run persistence (no-remote-git contract)

Code state moves between runs through the local execution-workspace cwd alone — not through a git remote.

- Each run's prepare step bundles the local worktree to the run's remote dir over ssh, with no `git remote` configured.
- The adapter's restore step at the end of the run writes any new remote commits back into the local worktree directly.
- Adapters must never `git push` from runtime code, and must never assume a remote exists.
- A failed restore is a run-level error and records `workspace_finalize=failed` on the execution workspace, which gates dependent issue wakes until the next successful finalize.

The invariant is enforced by the "no-remote-git contract" case in `packages/adapter-utils/src/ssh-fixture.test.ts`, which asserts a remote-only commit reaches the local worktree with no remote configured at any point.

## Current implementation guarantees

With the current implementation:

- Project workspace command config is the fallback for execution workspace UI controls.
- Execution workspace runtime overrides are stored on the execution workspace.
- Heartbeat runs auto-start the workspace's `running`-desired runtime services (via `ensureRuntimeServicesForRun`); services set to `stopped`/`manual` stay UI-controlled.
- A configured runtime provision command runs once, lazily, before the first runtime-service start.
- Server startup does not auto-restart workspace services.
