---
title: 状态卡片
summary: 实验性查询摘要、刷新策略、费用和智能体编辑
---

## 简体中文

Status Cards 是实验性的公司级摘要面板。每张卡由一条关注提示创建，例如“本周受阻的发布工作有什么更新——告诉我下一项决策”。卡片 agent（默认是内置 Summarizer，也可在创建或设置时指定）会将这段文字编译成有界的公司搜索查询，并在每次摘要中把同一条消息作为指令；没有额外的摘要提示词。请在 **Instance Settings > Experimental** 启用 **Status Cards**。`enableStatusCards` 关闭时，UI 路由和 REST API 都返回 not found。

### 更新方式

Paperclip 先用 SQL 检测数据变化，再决定是否消耗模型 token。调度器重复运行已保存查询，并与前次 fingerprint 对比，若有重要新增、移除或指定字段变化则标记待更新。

- **Manual** 是默认值：卡片会变旧，但不自动更新。
- **Interval** 每 5、15、30 或 60 分钟检查，只有结果变化才更新。
- **Reactive** 在 debounce 窗口后对显著变化更新；v1 默认等待 60 秒，每小时最多 6 次。
- **Active hours** 会将配置时段之外的变化暂存到之后处理。
- **Daily token caps** 达到日预算后暂停自动工作，仍可手动刷新。

增量更新只接收上一次摘要和发生变化的任务。提示词或 agent 改变、变化量过大、定期 drift 检查、从归档恢复或手动 full refresh 时会完整重建。归档会解除卡片调度；恢复后卡片保持 stale 并安排全量刷新，不会悄悄恢复旧计划。

### 费用参考

v1 Summarizer 默认采用 haiku 级 model，下表只是规划估算，实际费用随 provider 价格和所选 model 变化：增量更新约 1–2k 输入、0.3k 输出 token，约 $0.003–0.006；忙碌卡片每 15 分钟检查并连续运行 9 小时，约 10–18 次变更触发更新，约 $0.03–0.10/天；Reactive 最坏情况为 9 小时每小时 6 次，约 $0.15–0.35/天/卡片；全量重建约 5–8k 输入和 1k 输出，约 $0.01–0.02；SQL 变化检测本身费用为 $0。

生成费用进入常规成本账本，也写入卡片更新历史。面板显示当日 token/费用、逐次历史、归档卡片累计费用和创建时估算。

### Agent 创建与调试

拥有 `tasks:assign` 权限的 agents 可通过 REST API 创建卡片，但 v1 UI 暂不展示 agent 创建的卡片入口；创建的卡片会出现在全公司共享面板。Agent 只能管理、刷新、重新编译、归档或删除自己创建的卡片，最多创建 20 张（删除后释放名额），关注提示最多 4,000 字符；董事会创建的提示 API 上限为 20,000 字符。所有路由仍受 company scope 与 `enableStatusCards` 保护。创建后会立即排入 Summarizer 编译任务；agent 不应直接调用查询或摘要写回接口，它们只接受指定 Summarizer generation issue/run。可参考内置 `status-card-query` skill。

临时 Debug 标签页展示关注提示、编译后的 query JSON 和 dry-run 结果，仅用于调试实验编译器，不是永久日常流程。只有当普通卡片抽屉和更新历史能排查编译失败及任务数、支持人员可通过 API 检查 query/dry-run，且没有依赖专用 UI 的验收/回归用例时，才应移除该标签页；底层 API 可继续供支持工具使用。

---

Status cards are an experimental company-wide board of persistent summaries. Each card is set up with a single message such as “blocked launch work updated this week — tell me the next decision.” The card's agent (the built-in Summarizer by default, or a per-card override chosen at creation or in settings) compiles that prose into bounded company-search queries, stores the effective query set, and follows the same message as the instructions for every summary it writes. There is no separate summarization prompt to append to or replace.

Enable **Status Cards** from **Instance Settings > Experimental**. When `enableStatusCards` is off, the UI routes and REST API return not found; the feature does not leak into non-enabled instances.

## How updates work

Status cards use SQL change detection before spending model tokens. Paperclip reruns the stored query set on scheduler ticks, compares the result with the previous fingerprint, and marks meaningful additions, removals, or configured field changes as pending.

- **Manual** is the default. Changes make the card stale, but Paperclip never starts an automatic update.
- **Interval** checks every 5, 15, 30, or 60 minutes and only starts an update when the watched result changed.
- **Reactive** waits for the debounce window, then updates after significant changes. The v1 defaults are a 60-second debounce and at most 6 updates per hour.
- **Active hours** batch changes outside the configured window into a later update.
- **Daily token caps** pause automatic work when the card reaches its budget. Manual refresh remains available.

Incremental updates receive the previous summary and only the changed tasks. Paperclip uses a full rebuild after prompt or agent changes, large deltas, periodic drift guards, restore from archive, or an explicit full refresh. Archived cards are disarmed; restoring one leaves it stale and schedules a full refresh rather than silently resuming the old schedule.

## Cost model

The following planning estimates use the v1 Summarizer's haiku-class default model. Provider pricing and the selected model can change the actual cost.

| Work | Estimated usage | Estimated cost |
| --- | --- | --- |
| Incremental update | 1–2k input, about 0.3k output tokens | $0.003–0.006 |
| Busy 15-minute card over 9 hours | about 10–18 change-gated updates | $0.03–0.10/day |
| Reactive worst case | 6 updates/hour for 9 hours | $0.15–0.35/day per card |
| Full rebuild | 5–8k input, about 1k output tokens | $0.01–0.02 |
| Change detection | SQL only | $0 |

Each completed generation is attributed through the normal cost ledger and copied into status-card update history. The board shows today's token and cost totals, per-update history, archived-card lifetime cost, and a create-flow estimate.

## Agent authoring

Agents with `tasks:assign` access can create status cards through the REST API. Agent-authored cards are intentionally hidden from the v1 create UI but appear on the shared company board.

Agent authoring has additional guardrails:

- an agent can manage, refresh, recompile, archive, or delete only cards it authored
- an agent can author at most 20 cards; deleting a card frees a slot
- an agent interest prompt is limited to 4,000 characters
- board-authored prompts retain the general 20,000-character API limit
- all routes remain company-scoped and behind `enableStatusCards`

Creating a card immediately queues the Summarizer compile run. Agents should not call the query or summary write-back endpoints themselves; those endpoints accept only the assigned Summarizer generation issue and run.

See the bundled `status-card-query` skill for a copy-pasteable agent API recipe.

## Temporary debug view

The debug tab exposes the interest prompt, compiled query JSON, and a dry-run result while the experimental query compiler is being tuned. It is not intended to become a permanent operator workflow.

Remove the dedicated debug view when all of these are true:

1. compilation failures and effective watched-task counts are diagnosable from the normal card drawer and update history
2. support can inspect the stored query and dry-run through the API without requiring board users to interpret raw JSON
3. status-card QA has no open acceptance or regression case that depends on the debug-only UI

The underlying API may remain available for support tooling even after the temporary tab is removed.
