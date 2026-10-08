# Paperclip Bridge v1 wire contract

Status: coordination draft for Hermes and the board UI. Names below are the
stable external contract; database rows remain private to Paperclip.

## Protocol and identity

- Protocol schema: `paperclip_bridge_v1`.
- Every request is scoped by a Paperclip `companyId` resolved from the
  authenticated agent/binding. Callers cannot choose a company, binding
  revision, accounting owner, or Paperclip actor identity in an event payload.
- A binding is addressed by `bindingId` plus immutable positive integer
  `revision`. A binding has immutable `bindingKind` and `externalKey`; revisions contain optional
  `agentId`, `projectId`, `issueId`, `goalId`, `conversationId`, and
  `accountingOwnerAgentId`; owner assignment is written only by the trusted
  scheduler. A revision is effective on `[validFrom, validUntil)`.
- Historical deliveries may use the revision that was effective when the
  source event was created. Expired revisions are rejected for new events.

## Hermes database function contract

The Hermes database role is granted `EXECUTE` only on the following
`paperclip_bridge_v1` functions. It receives no table privileges and no
management or receipt mutation privileges.

```text
append_event(
  binding_id uuid, binding_revision integer,
  protocol_version integer, payload_version integer,
  event_kind text, source_kind text, source_key text, payload jsonb,
  client_payload_sha256 text, occurred_at timestamptz
) -> (event_id uuid, replayed boolean)

read_snapshot(binding_id uuid, binding_revision integer, snapshot_key text)
  -> (snapshot_version bigint, tombstone boolean, payload jsonb, updated_at timestamptz)

read_receipt(event_id uuid, consumer text)
  -> (state text, attempt integer, retry_at timestamptz, last_error text)
```

`append_event` validates the caller's role-to-binding mapping, company and
revision at `occurred_at`, protocol/payload versions, and payload size (64
KiB). `client_payload_sha256` is an optional client diagnostic hint only; the
server computes SHA-256 from PostgreSQL's canonical `payload::text` JSONB
representation and stores/compares that server-computed digest. A same-natural-
key/same-server-hash retry returns the original event; a different server hash
for that key is a conflict. It does not accept `companyId` or accounting owner
from the payload. Snapshot publication and receipt state transitions are
Paperclip-owned operations.

Migration `0299_hermes_bridge` implements server-side canonical hashing. Remote
sync acceptance still requires a real restricted-role database delivery.

The trusted database operator provisions the explicit
`binding_database_roles(database_role, binding_id, company_id, can_append,
can_read_snapshots, can_read_receipts)` map. Function authorization uses
`session_user`/`current_user` against this map; callers cannot supply a role
name as an argument. The DB operator provisions a Hermes login role and must
grant it schema usage plus EXECUTE only on the three named functions, for
example:

```sql
GRANT USAGE ON SCHEMA paperclip_bridge_v1 TO hermes_login;
GRANT EXECUTE ON FUNCTION paperclip_bridge_v1.append_event(uuid,integer,integer,integer,text,text,text,jsonb,text,timestamptz) TO hermes_login;
GRANT EXECUTE ON FUNCTION paperclip_bridge_v1.read_snapshot(uuid,integer,text) TO hermes_login;
GRANT EXECUTE ON FUNCTION paperclip_bridge_v1.read_receipt(uuid,text) TO hermes_login;
```

No table privileges are granted. The migration revokes PUBLIC privileges;
binding role rows are provisioned by Paperclip administration for each login.

## Board API contract

Base path: `/api/companies/:companyId/bridge`. All routes require an actor with
membership in the path company. Agent, project, issue, and goal references are
checked against that same company. Mutating management routes are board-only
and write activity log entries.

```text
GET    /bindings?kind=&cursor=&limit=
POST   /bindings                         (board)
POST   /bindings/:bindingId/revisions    (board; immutable revision)
POST   /bindings/:bindingId/snapshots    (board; revision,key,payload,tombstone)
GET    /bindings/:bindingId/revisions/:revision
GET    /snapshots?bindingId=&key=&cursor=&limit=
GET    /events?bindingId=&kind=&since=&cursor=&limit=
GET    /events/:eventId/receipts
GET    /conversations?agentId=&projectId=&issueId=&from=&cursor=&limit=
GET    /conversations/:conversationId   (conversation, full events, usage)
GET    /usage?agentId=&projectId=&issueId=&from=&to=&groupBy=request|session
```

Usage amounts are decimal integer strings in micro-USD; they are never JS
floating-point numbers. Request and session aggregate rows are mutually
exclusive for a given source session. Unattributable historical sessions have
`accountingOwnerAgentId: null` and `accountingStatus: "reconciliation_required"`.

The Bridge import is data ingestion, not a heartbeat or chat integration. It
must not create heartbeat runs, comments, or bot-authored Paperclip activity on
behalf of a conversation.

## Consumer and billed-cost acceptance

Paperclip periodically imports events with consumer `paperclip`. Conversation
indices use references from the trusted binding revision. Original full event
payloads remain in the events table and are served only within the path company
and conversation binding. `conversation.turn.chunk` events are reconstructed
using `capture_id`, zero-based `chunk_index`, `chunk_count`, `text`, and
`original_event_kind`; missing pieces remain retryable. Receipt completion,
usage projection, residual carry, ledger insertion, and spend updates commit
together. Consumer failures roll back those changes and record bounded retries.

`model.request.completed` and `model.auxiliary_request.completed` both expose their usage. An actual ledger charge
requires payload `cost` (or `billing`) with `currency: "USD"`,
`billingStatus: "billed"`, `pricingStatus: "priced"`, and decimal integer
`billedAmountMicroUsd`. Snake case equivalents are accepted. Source estimates
or ordinary Hermes cost totals do not satisfy these fields and remain visible
in the original payload without being counted as billed spend. Historical
revision owner absence remains `reconciliation_required`. The consumer never
creates heartbeat runs, issue comments, or bot conversation activity.
