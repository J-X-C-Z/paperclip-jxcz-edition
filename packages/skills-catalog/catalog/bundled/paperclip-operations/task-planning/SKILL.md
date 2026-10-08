---
name: task-planning
description: 编写或修订目标清晰、可验证的 Paperclip 计划。用户要求计划，或执行前需要消除实质不确定性时使用。
key: paperclipai/bundled/paperclip-operations/task-planning
recommendedForRoles:
  - manager
  - engineer
  - product
tags:
  - paperclip
  - planning
  - issues
  - delegation
---

# 任务规划

按工作需要规划。执行已获授权、下一步小而明确时，直接执行。要求计划本身不代表必须创建子任务或新增审批门槛。

说明预期结果、相关约束、所选方案和验收方法，列出影响执行的不确定性或待决定事项。采用用户偏好的格式；实施步骤保留在同一负责人的任务中，只有其他负责人、有价值的并行产出、真实依赖或独立审查需要时才拆分。

将用户要求的计划保存为键为 `plan` 的 issue 文档。更新当前版本，避免重复创建，并在回复中链接保存的文档。有原生文档工具时优先使用；旧版智能体按 `paperclip` 技能中的文档和规划 API 操作。

遵守规划模式和明确的审批要求。确需批准时，请求确认最新计划版本并等待决定。批准后，在当前普通任务中完成连贯工作；确需委派时，使用 `paperclip-converting-plans-to-tasks`。
