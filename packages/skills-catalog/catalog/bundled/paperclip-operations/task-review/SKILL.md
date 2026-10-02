---
name: task-review
description: Review a member's submitted Paperclip task against its acceptance criteria and verification evidence, then approve or return it through the task review stage.
key: paperclipai/bundled/paperclip-operations/task-review
recommendedForRoles:
  - manager
  - engineer
tags:
  - paperclip
  - review
  - acceptance
---

# Task Review

Use this skill when you are the designated reviewer of a submitted task. Read the Paperclip runtime skill for authentication, checkout, run audit headers and the available review API; never invent an endpoint or bypass a review stage with a direct status edit.

1. Read the task, plan, acceptance criteria, submitted artifacts, work products and prior review feedback.
2. Confirm you are authorized to review this task and it is in your review stage. Preserve company and project boundaries. Acquire checkout when the runtime requires it; stop on a checkout conflict.
3. Check the actual artifacts against each acceptance criterion. Run proportionate verification where needed. A progress claim is not validation evidence.
4. If every criterion is satisfied, submit the approval decision through the task's review workflow. Explain what was checked and link the deliverables. The server advances the task to completion.
5. If any criterion fails, return the task through the review workflow to the original execution member. State the failed criterion, concrete evidence and exact correction needed. Do not silently change scope or assign unrelated work.
6. If evidence, access or dependencies are missing, record the blocking condition and keep the task awaiting review. Never approve merely because the worker or reviewer is unavailable.

All task mutations follow the Paperclip run audit convention. Do not review your own submission, remove a required review stage, or elevate your own authority. Summarize useful lessons after the review cycle without exposing credentials or private company data.
