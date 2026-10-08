# Upstream updates with local enhancements

Keep the official implementation for shared behavior. Add local behavior through
the existing template registry, adapters, service helpers and translation
catalogs. Preserve the local department/group model, Secretary template, Brief,
Bridge, MiMo/DSH support and model profiles. Do not replace a conflicted shared
module wholesale with either side.

## Boundaries that reduce repeat work

- Keep protocol identifiers, JSON keys and upstream English translation keys
  stable. Put UI Chinese text in the existing catalogs. Product language and
  test language are separate: ordinary upstream UI fixtures use English in
  both jsdom and Node/SSR; language-specific fixtures select Chinese explicitly.
- Template API tests compare the canonical registry. The shared registry
  contract still requires the local presets, unique IDs, valid schemas and
  their authority limits, while allowing additional presets.
- Migration replay fixtures use `@paperclipai/db/test-migrations` (or the local
  `test-migrations.js`) to locate SQL by its name, independent of its ordinal.
  Missing or ambiguous names fail. Journal/numbering integrity tests continue
  to read exact journal tags: never hide journal drift with this helper.
- Preserve applied SQL bytes, hashes and receipts. Resolve new migration
  collisions by inventorying the real database and appending missing migrations
  after the local journal. Never replay an applied migration just because its
  filename changed, or hand-edit generated schema snapshots.
- Fixture records must satisfy the database contract (`permissions` is an
  object, agents have a company ID). Publish callback queue envelopes with the
  existing atomic writer. These prevent false failures under load.

## Update procedure

1. Identify the authoritative checkout, dirty changes, running service and
   applied database journal. Archive the complete source and a Git bundle.
   Fetch and freeze one official target SHA; record the merge base and scope.
2. Merge in an isolated candidate. Review accounting, authorization, run
   recovery and schema conflicts together with their callers. Use one durable
   accounting path, keep company/issue guards and native transaction/outbox
   boundaries, and retain local extensions.
3. Run the smallest affected checks first. For broad updates, complete the
   repository-required typecheck, test suite and build. Use Luna agents for
   tests and keep each test process bounded to one worker. The official runner
   supports the complete suite as four groups:

   ```sh
   pnpm test:run --mode general --group general-server
   pnpm test:run --mode general --group general-workspaces-a
   pnpm test:run --mode general --group general-workspaces-b
   pnpm test:run --mode serialized
   pnpm -r typecheck
   pnpm build
   ```

   Use the repository-pinned pnpm and a supported Node release. Test with
   `NODE_USE_ENV_PROXY=0`; local HTTP fixtures must not be rewritten by an
   environment proxy. Enable proxy support separately for build downloads
   when needed. Preserve commands, cwd, source SHA, exit codes and logs.
4. Classify failures before editing: product regression, stale fixture, language
   expectation or environment/resource issue. Keep permission, data retention,
   byte integrity, idempotence and containment assertions. If only a fixture
   changes, rerun its full file; if shared code/setup changes, rerun the affected
   suites. Reuse passed results for unchanged code and test setup. Record skips
   separately. Avoid parallel load during bounded large-file tests.
5. Restore a database backup into an isolated instance, quarantine copied
   execution ownership/leases, and test migrations, a second no-op application,
   historical data and constraints. Validate the built UI in a browser.
6. Once accepted, stop new admissions and wait for existing runs to drain. Stop
   the service through its supervisor, take a fresh stopped backup, verify the
   physical database identity and journal, migrate, switch to the candidate,
   and verify service SHA/readiness and existing workflows. If validation or
   draining fails, keep the online switch paused. A partially migrated database
   needs a checked recovery plan; restarting the old binary alone is not a
   database rollback.

Small upstream fixes need proportionate checks; broad schema/security/runtime
updates still need full acceptance. These boundaries reduce mechanical conflicts
and repeated verification, not the review required for changed behavior.
