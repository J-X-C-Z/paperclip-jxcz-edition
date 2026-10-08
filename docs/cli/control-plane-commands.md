---
title: 控制平面命令
summary: 任务、智能体、审批和仪表盘命令
---

用于管理任务、智能体、审批等内容的客户端命令。

## 任务命令

```sh
# 列出任务
npx paperclipai issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# 查看任务详情
npx paperclipai issue get <issue-id-or-identifier>

# 创建任务
npx paperclipai issue create --title "..." [--description "..."] [--status todo] [--priority high]

# 更新任务
npx paperclipai issue update <issue-id> [--status in_progress] [--comment "..."]

# 添加评论
npx paperclipai issue comment <issue-id> --body "..." [--reopen]

# 签出任务
npx paperclipai issue checkout <issue-id> --agent-id <agent-id>

# 释放任务
npx paperclipai issue release <issue-id>
```

## 公司命令

```sh
npx paperclipai company list
npx paperclipai company get <company-id>
npx paperclipai company current [--company-id <company-id>]

# 导出为可移植的文件夹包（写入清单和 Markdown 文件）
npx paperclipai company export <company-id> --out ./exports/acme --include company,agents

# 预览导入（不写入数据）
npx paperclipai company import \
  <owner>/<repo>/<path> \
  --target existing \
  --company-id <company-id> \
  --ref main \
  --collision rename \
  --dry-run

# 执行导入
npx paperclipai company import \
  ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

在云托管实例上无法使用 `company import`，服务器会返回 `403` 和 `code: "cloud_managed"`。云托管实例仍支持导出。

使用智能体身份验证时，可通过 `company list` 或 `company current` 确定当前作用范围内的公司。`company list` 会先尝试获取看板范围内的公司列表；如果无权访问，则依次使用 `--company-id`、`PAPERCLIP_COMPANY_ID`、上下文或 `/api/agents/me`，并且只返回当前作用范围内的公司。`company create` 是实例级设置命令，因此需要看板管理员或实例管理员身份验证。

## 智能体命令

```sh
npx paperclipai agent list
npx paperclipai agent get <agent-id>
```

## 技能命令

```sh
# 浏览应用内置技能目录，不更改公司状态
npx paperclipai skills browse [--kind bundled|optional] [--category software-development] [--query github]
npx paperclipai skills search "pull request" [--json]

# 安装前检查目录元数据和文件清单
npx paperclipai skills inspect github-pr-workflow

# 将目录中的技能安装到公司技能库
# 此操作不会将技能关联到任何智能体。
npx paperclipai skills install github-pr-workflow --company-id <company-id>
npx paperclipai skills install github-pr-workflow --as pr-flow --force --company-id <company-id>

# 外部来源仍需使用 import，而不是从目录安装
npx paperclipai skills import ./skills/my-skill --company-id <company-id>
npx paperclipai skills import owner/repo/path/to/skill --company-id <company-id>

# 安装或导入后，将需要的公司技能关联到智能体
npx paperclipai skills agent sync <agent-id> --skill github-pr-workflow --mode add --company-id <company-id>
```

## 审批命令

```sh
# 列出审批
npx paperclipai approval list [--status pending]

# 查看审批
npx paperclipai approval get <approval-id>

# 创建审批
npx paperclipai approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# 批准
npx paperclipai approval approve <approval-id> [--decision-note "..."]

# 拒绝
npx paperclipai approval reject <approval-id> [--decision-note "..."]

# 请求修改
npx paperclipai approval request-revision <approval-id> [--decision-note "..."]

# 重新提交
npx paperclipai approval resubmit <approval-id> [--payload '{"..."}']

# 添加评论
npx paperclipai approval comment <approval-id> --body "..."
```

## 活动记录命令

```sh
npx paperclipai activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## 仪表盘

```sh
npx paperclipai dashboard get
```

## 实例设置

```sh
npx paperclipai instance settings:general
npx paperclipai instance settings:general:update --payload-json '{...}'
npx paperclipai instance settings:experimental
npx paperclipai instance settings:experimental:update --payload-json '{...}'
```

实验性功能需主动启用，且不保证兼容性。它们可能随时发生变化、无法使用或被移除，请自行承担使用风险。

## 心跳

```sh
npx paperclipai heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
