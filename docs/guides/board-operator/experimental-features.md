---
title: Experimental Features
summary: What Paperclip experimental features mean for board operators
---

## 简体中文

实验性功能需主动启用，不提供兼容性保证，可能随时更改、损坏或移除。它们尚未纳入稳定的 operator 契约；UI、API、CLI、行为和存储配置都可能变化，也不保证兼容、回滚、迁移或长期支持。重要的稳定生产流程不应依赖实验功能。

### 启用与注意事项

在 **Instance Settings > Experimental** 启用或关闭功能；CLI 也可用：

```sh
pnpm paperclipai instance settings:experimental
npx paperclipai instance settings:experimental:update --payload-json '{...}'
```

部分由托管方管理的控件可能隐藏，但其配置值会保留。

**Chat connectors** 默认关闭。启用后可将专用 Slack、GitHub、Microsoft Teams、Telegram 或 Discord bot 连接到一个 Paperclip agent，并显示聊天设置、连接管理、agent channel 和外部任务控制。关闭该显示设置不会断开现有 bot 或停止消息；要停止连接，请先在聊天连接设置中暂停。

实验功能适合评估新能力、测试非关键流程且能接受版本间变化的场景。启用前确认流程可承受变化、缩小试用范围，并留意发布说明和文档。

---

Experimental features are opt-in and are provided without compatibility guarantees. They may break, change, or be removed at any time. Use them at your own risk.

## What "experimental" means

When a feature is marked experimental, Paperclip is still evaluating the product shape and implementation details.

- The feature is not part of the stable operator contract yet.
- UI, API, CLI, behavior, and stored configuration may change as the feature evolves.
- Paperclip does not promise compatibility, rollback, migration, or long-term support for experimental features.

If you need stable behavior for an important workflow, do not rely on an experimental feature.

## Where you enable them

Board operators enable or disable experiments from **Instance Settings > Experimental** in the app.
Controls are listed alphabetically within each section. Hosting operators can hide
controls they manage; empty developer and legacy sections are omitted. Hidden
controls retain their configured values.

The CLI exposes the same surface:

```sh
pnpm paperclipai instance settings:experimental
npx paperclipai instance settings:experimental:update --payload-json '{...}'
```

Those commands change the same opt-in settings that the UI manages.

## Chat connectors

**Chat connectors** is off by default. Enable it to connect a dedicated
Slack, GitHub, Microsoft Teams, Telegram, or Discord bot to one Paperclip
agent. The experiment shows chat setup, connection management, agent channels,
and external task controls.

When it is off, existing production tool connectors remain available. For
example, GitHub opens its normal tool connection flow without asking you to
choose between chat and tools.

This setting controls visibility. Turning it off does not disconnect an
existing bot or stop its messages. To stop a connection, pause it from its
chat connection settings before turning off the experiment.

## When to use them

Experimental features are best used when you are:

- evaluating a new capability before wider rollout
- testing a non-critical workflow
- comfortable with behavior changes between releases
- prepared to stop using the feature if it changes or disappears

## Operator expectations

Before enabling an experimental feature:

- decide whether the workflow can tolerate breakage or churn
- avoid making the feature a dependency for stable production processes
- keep the scope small until you understand how the feature behaves in your company
- watch release notes and docs for changes to the feature contract

## Related references

- See [Status Cards](/guides/board-operator/status-cards) for the watched-query summary experiment, refresh policies, and cost model.
- See the CLI caveat in [Control-Plane Commands](/cli/control-plane-commands).
- See the repo CLI reference in [`doc/CLI.md`](https://github.com/paperclipai/paperclip/blob/master/doc/CLI.md) when working from the repository.
