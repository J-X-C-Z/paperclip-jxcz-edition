# Hermes Paperclip Bridge

Standalone Hermes plugin that captures session, tool, primary model-request,
and auxiliary model-request events. It stores every event in a profile-specific
SQLite queue before delivery; the queue uses SQLite WAL, stable `source_key`
values, and a client payload digest for diagnostics. A background flusher retries
after reconnect and resumes queued rows after Hermes restarts. The plugin never writes Hermes'
`state.db`.

## Compatibility

This checkout's managed Hermes runtime reports `0.21.5+6241.gc8301ea` (2026-09-24).
The plugin uses Hermes' public `plugin.yaml` + `register(ctx)` hook API and the
documented `post_llm_call`, `post_tool_call`, `post_api_request`,
`post_auxiliary_call`, and session hooks. It imports no Hermes internals.

## Setup

Install and enable `paperclip-bridge` in the target Profile. Hermes' plugin
manager admits the declared `psycopg` Python dependency. Configure the plugin's
Profile scoped settings:

```yaml
binding_id: <board-created-binding-uuid>
binding_revision: 1
queue_path: ""
memory_snapshot_key: memory
snapshot_refresh_seconds: 60
```

Set the `database_url` secret through Hermes plugin settings, which stores it
as `PAPERCLIP_BRIDGE_DATABASE_URL` in the target Profile's `.env`. Do not put
the DSN in `config.yaml`. `ctx.get_config` reads ordinary settings only.
The Profile name is captured from the public `ctx.profile_name` API. The
public `ctx.on_unload` callback stops the plugin's background flusher on reload.

The queue defaults to `$HERMES_HOME/paperclip-bridge/queue.sqlite3`. Set an
explicit board-created binding and immutable revision for each Hermes Profile;
the plugin refuses to start capture without both. Use a distinct queue file
per Profile. The database role needs only `EXECUTE` on the approved Bridge
functions. The plugin calls `paperclip_bridge_v1.append_event` and
`read_snapshot`; it does not issue SQL against Paperclip business tables.

## Delivery behavior

Delivery calls the versioned `paperclip_bridge_v1.append_event` function with
the binding revision, event kind, stable source key, payload, client diagnostic
digest, and occurrence time from `doc/bridge-wire-contract.md`. The server must
compute the canonical PostgreSQL JSONB digest and use it for conflict checks.
Acknowledgement is
recorded in SQLite only after the PostgreSQL transaction commits. Failed sends
use exponential backoff with jitter capped at five minutes; batches are limited
to 100 events or 1 MiB. Retries keep the persisted source key. If Hermes does
not provide a native event identifier, each callback is assigned a new opaque
key, so delivery retries are idempotent but a host-level callback replay cannot
be deduplicated reliably.

Known secret fields and bearer strings are redacted before local persistence.
Conversation text remains intact for session viewing, so deployments must not
send credentials as ordinary chat content.

`conversation.turn.completed` preserves the full `conversation_history` and
assistant response supplied by Hermes. Provider usage and sanitized request
metadata are recorded per primary and auxiliary request. Hermes `state.db` gap
fill is profile-scoped and read-only. Role memory snapshots are refreshed via
`read_snapshot`, cached in the profile SQLite queue database, and injected from
cache without a network request on the model callback path.

Large completed turns and session backfill snapshots are stored atomically as
`conversation.turn.chunk` events rather than clipped or dropped. Each chunk
payload contains `session_id`, `capture_id`, zero-based `chunk_index`,
`chunk_count`, `original_event_kind`, and `text`. The text is a UTF-8-safe part
of the complete sanitized event payload JSON (at most 24 KiB before JSON
string escaping). Reassemble all parts in index order and JSON-decode them to
recover the original event; an incomplete group must stay visibly incomplete.
Chunk source keys are `<capture_id>:chunk:<index>`. Native request identity
includes Hermes' `api_request_id`, session, and physical retry counters. Same
native callback retries retain the original local occurrence time.

Role snapshots persist in the Profile's queue database and survive Hermes
restarts and PostgreSQL outages. A successfully received tombstone removes
the cached context. The flusher starts at plugin registration so an initial
snapshot can arrive before the first turn.

Validation: `python3 -B plugins/hermes-paperclip-bridge/test_bridge.py` runs the
offline regression suite. `hermes plugins validate <plugin-directory> --json`
checks public hook/manifest compatibility without enabling or deploying it.

## Diagnostics

The local queue database can be inspected with SQLite using `PRAGMA
query_only=ON`; pending records retain their last error and retry schedule. The
plugin logs a source key on database failure. Do not log event payloads because
they contain conversation content.
