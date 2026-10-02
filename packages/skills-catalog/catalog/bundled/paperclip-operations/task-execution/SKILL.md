---
name: task-execution
description: Execute an assigned Paperclip task within its scope, verify the deliverable, report blockers and submit artifacts for the designated leader's review.
key: paperclipai/bundled/paperclip-operations/task-execution
recommendedForRoles:
  - engineer
  - designer
  - qa
tags:
  - paperclip
  - execution
  - artifacts
---

# Task Execution

Use this skill for an assigned execution task. Read the Paperclip runtime skill and use its supplied identity, authentication, checkout and audit conventions.

1. Read the task description, plan, acceptance criteria, context and real blocker relationships. Parent-child nesting does not imply an execution dependency.
2. Checkout before modifying the task. On conflict, stop competing for ownership. Work only within the assigned scope and existing company, approval, budget and execution boundaries.
3. Inspect the relevant inputs, implement the requested result and perform checks proportional to the change. Preserve unrelated work.
4. When blocked, update the task with the reason, impact and exact condition needed to resume; notify the leader through the task's permitted reporting workflow. Do not solve a blocked dependency by marking it complete.
5. Upload user-inspectable artifacts through Paperclip and link them as work products. Workspace-only files require a workspace-file work product; a local path alone is not a deliverable.
6. Submit a concise report: what was completed, what changed, how it was verified, remaining limitations and linked artifacts. Submit through the designated review workflow and leave the task awaiting the leader's review.
7. On return, address the review feedback, rerun relevant checks and resubmit. Preserve the original acceptance criteria unless an authorized owner changes them.

Do not create or assign tasks, manage other agents, change your own permissions, approve your own work, directly set done, or remove the required review stage. The leader owns the acceptance decision.
