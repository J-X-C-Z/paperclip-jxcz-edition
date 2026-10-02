# Paperclip upstream update — 2026-10-02

## Result

Merge upstream master `c83df091b1a5207375eaf23466bb5c62e4e1518e` (294 upstream commits since the shared base) into the local enhancements preserved at `260ea83454b0261a7055c0b3b11b108ffb3d0ed6`. The original checkout is `/Users/jxcz/Agent Workspace/Paperclip`.

Preserved: Chinese UI, project workspaces and scoped queries, native project agent membership, departments/groups and the improvement-teams integration, four built-in agent templates/company overrides and leader review policy, cost estimates/currency and organization attribution, DSH/MiMo adapters, local Codex CLI authentication and isolated agent homes, route/dialog lazy loading and existing performance work.

Upstream retires its Composio services and keyboard-shortcut preference. Local changes to those surfaces were translations; keyboard shortcuts remain enabled. The upstream personal-inbox badge accounting is adopted while retaining the company health summary. The merged paused-turn cost logic preserves missing-cost state instead of reporting an unpriced empty turn as zero-cost.

## Database compatibility

Keep deployed local migrations 0280–0282 unchanged. Append the 14 upstream migrations as 0283–0296 in upstream order with monotonically increasing timestamps above the deployed local journal. SQL contents are unchanged; the final schema snapshot is regenerated with drizzle-kit from the combined schema, not text-merged. Full mapping is saved in the backup directory.

A new logical backup was restored into the isolated `paperclip_update_check_20261002` database and all migrations applied successfully. Counts before/after: 3 companies, 39 agents, 12 projects, 71 tasks, 20 project memberships, 2 template overrides, 6 groups, 20 group members, 2 departments. Custom records also match content hashes; timestamp fields are excluded from the comparison because the existing logical backup serializes dates at millisecond precision. The actual application database is migrated in place and is never restored from that copy.

## Verification

- Full recursive typecheck and full build: passed.
- UI production build, token gates: passed.
- Final schema snapshot drift and migration safety/numbering: passed.
- 182 isolated real-database server tests: passed, including project membership/scoping, authorization, template review, hire/auth inheritance, tasks and cost accounting.
- 43 agent configuration API tests: passed. Initial overloaded timeout attempt failed; isolated rerun passed.
- 100 additional server tests: passed.
- 367 chat/LiveUpdates/project-scope/template component tests: passed.
- 31 provider connection tests: passed with an isolated English test configuration; product language remains Chinese.
- 69/70 clipboard/model/Markdown tests: one preexisting English `Task` assertion expects the localized `任务` label.
- AgentTemplates, Costs, Dashboard, Agents and IssueDetail targeted page suites: passed (206 tests across the larger page batch passed).
- All 5 newly added upstream experimental settings tests: passed after language-aware assertions; the full experimental suite has the same 24 failures as the original checkout.
- Read-only original-checkout comparison: the selected five legacy page suites already fail 52 assertions. Groups and Departments failures match the candidate; CompanySkills has fewer failures after merging. English selectors against Chinese UI account for most failures. No claim that the entire legacy suite passes.
- Broad `pnpm test:run` was attempted, then stopped after targeted acceptance completed; optional DB suites in that run skipped without an administrator fixture. The important database paths were rerun against isolated test databases and passed. No claim that the broad suite completed.

## Recovery

Source backup branches: `codex/paperclip-local-backup-20261002` (initial), `codex/paperclip-local-backup-20261002-latest` and `codex/paperclip-local-backup-20261002-final` (completed concurrent localization; final source `7685787c3e5a89e8a5f2877d84dd276f3b7bb606`).

Concurrent localization was captured in two further snapshots and merged. The last editor color fix is preserved at `cfa506c770a44ce9b0e5809183bfee1a253bac65` / `codex/paperclip-local-backup-20261002-editor`. The completed translation task’s changes were included before activation. UI typecheck, production build, token gates and i18n tests passed again after those additions.
Source archive, binary diff, status manifest, migration map and rehearsal evidence: `/Users/jxcz/Documents/ChatGPT/paperclip 增强/update-backups/2026-10-02/`.
Pre-update logical DB backups: initial `paperclip-20261002-184829.sql.gz` and latest `paperclip-20261002-191022.sql.gz` in `/Users/jxcz/.paperclip/instances/default/data/backups/`, with copies retained in the source backup directory.

Do not roll source back against the migrated database without accounting for the new migration journal; retain the backup and mapping. No upstream push, external publication, model execution or cloud resource creation is part of this update.

## Live acceptance

Completed on the primary checkout, branch `codex/paperclip-updated-20261002`, containing upstream `c83df091b` and all preserved local snapshots. User authorized immediate restart; 1 run was active at the activation check.

The 14 live migrations completed in place. Exact before/after counts and hashes (including timestamps) match: 3 companies, 42 agents, 12 projects, 74 tasks, 20 project memberships, 2 template overrides, 6 groups, 20 group members and 2 departments. Evidence: `live-database-verification.json` in the backup directory. Runtime recovery may subsequently update task/run states through its normal upstream behavior; the data comparison was taken around migration before restarting.

Resolved stale orphan watcher contention during startup. Also repaired an upstream startup compatibility bug: historical run/agent company mismatches must be skipped before budget lookup, rather than aborting all startup recovery with “Agent not found”. Added a real-database regression; all 40 legacy-continuation authority tests pass. Server typecheck and production build pass after this repair. Final UI production build passes with the concurrently added editor foreground/caret fix.

Live `/api/health`: status `ok`, auth ready, bootstrap ready, startup recovery `ready`; port 3100 belongs to the primary checkout. Read-only browser acceptance confirms Chinese groups/members/project assignment controls, departments, all four templates, cost estimates and organization breakdowns, and project-scoped agent filtering for 手机端开发. Screenshot: `output/playwright/upstream-update-project-scope.png`. No additional provider-auth or model-run smoke test was launched by this update.

Readback, migration evidence, acceptance logs and archives are retained in the backup directory. Temporary preview and rehearsal database are removed after acceptance.
