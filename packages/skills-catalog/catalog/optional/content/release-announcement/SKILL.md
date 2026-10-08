---
name: release-announcement
description: 撰写版本公告（变更日志、博客文章、应用内通知或社交媒体帖子），突出用户影响、明确目标读者，并说明升级/迁移步骤，不要添加填充内容。
key: paperclipai/optional/content/release-announcement
recommendedForRoles:
  - devrel
  - product
  - writer
tags:
  - release
  - changelog
  - announcement
  - communication
---

# 版本公告

根据发布渠道撰写合适的公告，避免无关内容。不同渠道需要不同形式：变更日志条目、博客文章和社交媒体卡片各不相同。读者应能在 30 秒内判断此版本是否影响自己，以及需要采取什么操作。

## 适用场景

- 版本、功能或修复即将发布，需要至少一种渠道的公告。
- 之前的私有功能即将正式发布（GA）。
- 破坏性变更需要在用户遇到之前提前通知。

## 不适用场景

- 变更仅限内部且不影响用户。更新内部文档即可，不要发布公告。
- 版本尚未完成（仍在开发中）。等待实际发布后再公告，即使营销团队希望提前发帖。

## Paperclip Cases 输出

在 Paperclip 中运行此技能且启用了 `experimental.enableCases` 时，交付文案前先创建持久化的版本内容 case。Case 用于保存可检查的输出；issue 用于协调工作。

API 合约请参阅 `skills/paperclip/references/cases.md`。如果已设置 `PAPERCLIP_RUN_ID`，写入时应包含 `X-Paperclip-Run-Id`。如果 API 返回 `403 Cases are disabled`，报告此限制，然后继续完成请求的文案成果。

如果父级版本 case 尚不存在，请先 upsert：

```json
{
  "caseType": "release",
  "key": "paperclip-release:vYYYY.MDD.P",
  "title": "Paperclip vYYYY.MDD.P 发布版本",
  "status": "in_progress",
  "fields": {
    "schema_version": 1,
    "version": "vYYYY.MDD.P",
    "release_date": "YYYY-MM-DD",
    "release_patch": 0,
    "stable": true,
    "channels": ["blog_post", "tweet_storm"],
    "artifacts": {
      "changelog_path": "releases/vYYYY.MDD.P.md",
      "publish_url": null
    }
  }
}
```

对于开发博客，upsert 一个子 case，并将 `parentCaseId` 设为版本 case：

```json
{
  "caseType": "blog_post",
  "key": "paperclip-release:vYYYY.MDD.P:blog-post",
  "title": "Paperclip vYYYY.MDD.P 发布公告",
  "status": "in_review",
  "parentCaseId": "<release-case-id>",
  "fields": {
    "schema_version": 1,
    "version": "vYYYY.MDD.P",
    "slug": "paperclip-vYYYY-MDD-P",
    "word_count_target": 650,
    "target_audience": ["operators", "developers"],
    "requires_screenshot": false,
    "links": {
      "release_notes": "releases/vYYYY.MDD.P.md",
      "publish_url": null
    },
    "sections": ["hook", "whats_new", "upgrade", "whats_next"]
  }
}
```

对于社交媒体内容，upsert 一个同级子 case：

```json
{
  "caseType": "tweet_storm",
  "key": "paperclip-release:vYYYY.MDD.P:tweet-storm",
  "title": "Paperclip vYYYY.MDD.P 社交媒体帖子",
  "status": "in_review",
  "parentCaseId": "<release-case-id>",
  "fields": {
    "schema_version": 1,
    "version": "vYYYY.MDD.P",
    "post_count": 1,
    "channel": "x",
    "target_audience": ["operators", "contributors"],
    "links": {
      "release_notes": "releases/vYYYY.MDD.P.md",
      "publish_url": null
    },
    "review": {
      "needs_human_copy_paste": true,
      "approved_by": null
    }
  }
}
```

将生成的文案写入 `PUT /api/cases/:caseId/documents/body`，并传入 `format: "markdown"` 和 `changeSummary`。更新已有正文文档时，先获取最新文档版本，并传入 `baseRevisionId`。

## 先确定读者和渠道

| Audience | Best channel | Tone |
|---|---|---|
| 读者 | 最合适渠道 | 语气 |
|---|---|---|
| 现有高级用户 | 变更日志、应用内通知 | 简洁、客观、带链接 |
| 使用你们 API 的工程团队 | 发布说明、开发博客 | 示例、迁移步骤、版本固定信息 |
| 潜在客户 | 产品页、营销博客 | 叙事结构、问题 → 解决方案、社会认同 |
| 广泛受众 | 社交媒体帖子、邮件简报 | 一句话介绍、深入阅读链接 |
| 内部团队 | Slack/Discord 帖子 | 变更内容、遇到问题时联系谁 |

为*当前*公告选择目标读者。一个版本通常需要多种公告，不要将它们混在一起。

## 通用结构

无论使用哪种渠道，都先说明：

1. **变更内容。** 用用户熟悉的语言写一句话。
2. **受影响人群。** 哪些用户角色/用例会受影响。
3. **需要采取的操作。** 现在迁移/选择加入/无需操作。

其他内容用于补充这三点。

## 渠道模板

### 变更日志条目（简洁）

```md
## v1.42.0 — 2026-05-26

### 新增
- <功能> — <一句话说明用户收益>。([#1234](link))

### 变更
- <变更> — <一句话说明影响>。([#1235](link))

### 修复
- <缺陷> — <一句话说明用户可见的问题>。([#1236](link))

### 弃用
- <内容>。由 <替代内容> 取代。计划在 v<x> 中移除。

### 破坏性变更
- <变更>。**迁移：** <一句话说明> 或 <迁移指南链接>。
```

### 发布说明（面向采用者）

包含变更日志的内容，另外还要包括：

- 包含变更前后代码的迁移指南章节。
- 兼容性表格（版本、运行时、操作系统）。
- 已知问题和解决办法。
- 致谢（贡献者、报告已修复缺陷的人员）。

### 开发博客文章（300–800 词）

- **开篇引入（1 段）：** 在真实场景中说明该版本解决的问题。
- **新增内容（3–5 个项目及对应段落）：** 介绍功能，每项配一个代码或截图示例。
- **升级（1 段）：** 说明如何升级以及需要检查什么。
- **后续方向：** 用一句话说明下一步方向。避免承诺。

### 应用内通知

- 1 句话。
- 1 个链接。
- 查看后关闭。

### 社交媒体帖子

- 1 句话的介绍。
- 1 个链接。
- 1 张图片或短视频。
- 不要为了引发争论而写。如果需要展开讨论，应改写为博客文章。

## 写作规则

- 从用户角度开篇，而不是从团队角度。`你现在可以导出 CSV` 优于 `我们新增了 CSV 导出`。
- 数字胜过形容词。`冷启动快 60%` 优于 `快得多`。注明测量方法。
- 用实际内容展示，不要只用文字描述。一个代码片段、一张截图即可；更多内容只会造成干扰。
- 标注发布日期。没有日期的版本内容很快就会过时。
- 明确链接到迁移指南。不要将迁移信息埋在文中。
- 使用 `**Breaking:**` 前缀标记破坏性变更。邮件/社交媒体渠道也应重复说明。

## 避免

- “我们很高兴地宣布”之类的填充语。
- 混合用户可见变更和内部变更的清单。
- 无法验证的营销说法。
- 尚未发布工作项的发布日期承诺。
- 预告团队尚未承诺交付的内容。

## 发布后清单

- 变更日志已随版本提交到源代码管理中。
- 博客文章日期与实际发布日期一致。
- 所有链接均有效（release tag、PR、文档章节）。
- 迁移指南中也说明了破坏性变更，不要只在公告中说明。
- 公开发布前先通知内部团队，不要等发布后再通知。
