"""Hermes hooks for durable Paperclip session capture.

This module uses only Hermes' public plugin hook API. It never writes to the
Hermes state database. Event transport is kept behind Bridge so its wire format
can be aligned with the Paperclip receiver contract.
"""

from __future__ import annotations

import json
import hashlib
import logging
import os
import random
import re
import sqlite3
import threading
import time
import uuid
from contextlib import closing
from pathlib import Path
from typing import Any
from urllib.parse import quote

LOG = logging.getLogger("paperclip_bridge")
_lock = threading.RLock()
_bridge: "Bridge | None" = None
_flusher_started = False
_plugin_context: Any = None
_missing_config_logged = False
_flush_seconds = 2
_flusher_stop: threading.Event | None = None
_flusher_thread: threading.Thread | None = None


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


_SECRET_FIELD = re.compile(r"(?:^|[_-])(api[_-]?key|access[_-]?token|refresh[_-]?token|bot[_-]?token|auth[_-]?token|password|passwd|secret|authorization|credential|dsn)(?:$|[_-])", re.I)
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): ("[REDACTED]" if _SECRET_FIELD.search(str(key)) else _sanitize(item))
                for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(item) for item in value]
    if isinstance(value, str):
        return _BEARER.sub("Bearer [REDACTED]", value)
    return value


class Bridge:
    def __init__(self, database_url: str, profile: str, binding_id: str, binding_revision: int,
                 db_path: str, snapshot_key: str, snapshot_refresh_seconds: int):
        self.database_url = database_url
        self.profile = profile
        self.binding_id = binding_id
        self.binding_revision = binding_revision
        self.db_path = db_path
        self.snapshot_key = snapshot_key
        self.snapshot_refresh_seconds = max(10, snapshot_refresh_seconds)
        self._pg = None
        self._last_snapshot_refresh = 0.0
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as db, db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA busy_timeout=5000")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS event_queue (
                    source_key TEXT PRIMARY KEY, event_type TEXT NOT NULL,
                    session_id TEXT, created_at REAL NOT NULL, payload TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at REAL NOT NULL DEFAULT 0,
                    delivered_at REAL, last_error TEXT, remote_event_id TEXT
                );
                CREATE INDEX IF NOT EXISTS event_queue_pending
                    ON event_queue(delivered_at, next_attempt_at, created_at);
                CREATE TABLE IF NOT EXISTS snapshot_cache (
                    snapshot_key TEXT PRIMARY KEY, snapshot_version TEXT NOT NULL,
                    tombstone INTEGER NOT NULL, payload TEXT NOT NULL,
                    updated_at TEXT, refreshed_at REAL NOT NULL
                );
            """)
            columns = {row[1] for row in db.execute('PRAGMA table_info("event_queue")')}
            if "remote_event_id" not in columns:
                db.execute("ALTER TABLE event_queue ADD COLUMN remote_event_id TEXT")

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=5)
        db.row_factory = sqlite3.Row
        return db

    def enqueue(self, event_type: str, session_id: str | None, payload: dict[str, Any]) -> None:
        payload_json = _json(_sanitize({"eventType": event_type, "profile": self.profile, "sessionId": session_id, **payload}))
        # Hermes hooks often expose a native identifier. Reuse it so a replayed
        # callback after a plugin restart has the same Bridge natural key. If
        # Hermes does not expose one, generate an opaque identity and persist it
        # with the local event. Content hashes are not identities: two genuine
        # messages can have identical content.
        native_id = next((payload.get(key) for key in (
            "event_id", "eventId", "message_id", "messageId", "call_id",
            "callId", "api_request_id", "request_id", "requestId", "tool_call_id",
            *( ("turn_id", "turnId") if event_type.startswith("conversation.turn.") else () ),
        ) if payload.get(key) not in (None, "")), None)
        attempt = _json([payload.get("api_call_count"), payload.get("retry_count")]) if event_type.startswith("model.") else ""
        source_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"paperclip-hermes:{self.binding_id}:{self.profile}:{session_id}:{event_type}:{native_id}:{attempt}")) if native_id is not None else str(uuid.uuid4())
        payload_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
        envelope = {
            "binding_id": self.binding_id,
            "binding_revision": self.binding_revision,
            "protocol_version": 1,
            "payload_version": 1,
            "source_kind": "hermes",
            "source_key": source_key,
            "event_kind": event_type,
            "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "payload": json.loads(payload_json),
            # Diagnostic hint only. Python's compact JSON encoding is not
            # PostgreSQL jsonb::text; the receiver must compute the canonical
            # digest and use that server-side value for conflict detection.
            "client_payload_sha256": payload_hash,
        }
        encoded = _json(envelope)
        if len(encoded.encode("utf-8")) > 64 * 1024:
            if event_type not in ("conversation.turn.completed", "session.backfill.snapshot"):
                raise ValueError("Paperclip Bridge event exceeds the 64 KiB contract limit")
            raw = payload_json.encode("utf-8")
            parts = []
            while raw:
                # JSON string escaping can double this serialized JSON part.
                boundary = min(24 * 1024, len(raw))
                while boundary < len(raw) and raw[boundary] & 0xC0 == 0x80:
                    boundary -= 1
                parts.append(raw[:boundary].decode("utf-8"))
                raw = raw[boundary:]
            envelopes = []
            for index, part in enumerate(parts):
                chunk_payload = {
                    "eventType": "conversation.turn.chunk", "profile": self.profile,
                    "sessionId": session_id, "session_id": session_id,
                    "capture_id": source_key, "chunk_index": index,
                    "chunk_count": len(parts), "text": part,
                    "original_event_kind": event_type,
                }
                envelopes.append({**envelope, "source_key": f"{source_key}:chunk:{index}",
                                  "event_kind": "conversation.turn.chunk", "payload": chunk_payload,
                                  "client_payload_sha256": hashlib.sha256(_json(chunk_payload).encode("utf-8")).hexdigest()})
            # Persist the entire capture atomically so no partial capture can
            # be flushed after a crash during local chunk creation.
            with closing(self._connect()) as db, db:
                for chunk in envelopes:
                    self._insert_envelope(db, chunk, session_id)
            return
        with closing(self._connect()) as db, db:
            self._insert_envelope(db, envelope, session_id)

    def _insert_envelope(self, db, envelope, session_id):
        encoded = _json(envelope)
        source_key = envelope["source_key"]
        if len(encoded.encode("utf-8")) > 64 * 1024:
            raise ValueError("Paperclip Bridge chunk exceeds the 64 KiB contract limit")
        inserted = db.execute("""INSERT OR IGNORE INTO event_queue
            (source_key,event_type,session_id,created_at,payload) VALUES (?,?,?,?,?)""",
            (source_key, envelope["event_kind"], session_id, time.time(), encoded))
        if not inserted.rowcount:
            existing = db.execute("SELECT payload FROM event_queue WHERE source_key=?", (source_key,)).fetchone()
            if existing:
                previous = json.loads(existing["payload"])
                # Callback time is transport metadata. Keep the original
                # occurrence time when the same native callback is replayed.
                if previous["payload"] != envelope["payload"] or previous["binding_revision"] != self.binding_revision:
                    raise ValueError("Hermes replay reused a source identifier with different content")

    def flush(self, limit: int = 100, max_bytes: int = 1024 * 1024) -> None:
        now = time.time()
        with closing(self._connect()) as db, db:
            rows = db.execute("SELECT source_key,payload,attempts FROM event_queue WHERE delivered_at IS NULL AND next_attempt_at<=? ORDER BY created_at LIMIT ?",
                              (now, limit)).fetchall()
        batch = []
        batch_bytes = 0
        for row in rows:
            size = len(row["payload"].encode("utf-8"))
            if batch and batch_bytes + size > max_bytes:
                break
            batch.append(row)
            batch_bytes += size
        for row in batch:
            try:
                envelope = json.loads(row["payload"])
                pg = self._postgres()
                result = pg.execute("""
                    SELECT event_id, replayed
                    FROM paperclip_bridge_v1.append_event(
                        %s::uuid, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::timestamptz
                    )
                """, (
                    envelope["binding_id"], envelope["binding_revision"],
                    envelope["protocol_version"], envelope["payload_version"],
                    envelope["event_kind"], envelope["source_kind"], envelope["source_key"],
                    _json(envelope["payload"]),
                    envelope.get("client_payload_sha256", envelope.get("payload_sha256")),
                    envelope["occurred_at"],
                ))
                remote_event_id, _replayed = result.fetchone()
                pg.commit()
                with closing(self._connect()) as db, db:
                    db.execute("UPDATE event_queue SET delivered_at=?,last_error=NULL,remote_event_id=? WHERE source_key=?",
                               (time.time(), str(remote_event_id), row["source_key"]))
            except Exception as exc:
                attempts = int(row["attempts"]) + 1
                delay = min(300, (2 ** min(attempts, 9)) * random.uniform(0.8, 1.2))
                with closing(self._connect()) as db, db:
                    db.execute("UPDATE event_queue SET attempts=?,next_attempt_at=?,last_error=? WHERE source_key=?",
                               (attempts, time.time() + delay, str(exc)[:500], row["source_key"]))
                LOG.warning("Paperclip Bridge queued event %s for retry (%s)", row["source_key"], type(exc).__name__)
                self._reset_postgres()
                # Preserve order; the next wake/restart resumes from this row.
                break
        self.refresh_snapshot()

    def _postgres(self):
        if self._pg is None or self._pg.closed:
            import psycopg
            self._pg = psycopg.connect(self.database_url, connect_timeout=3, autocommit=False,
                                      options="-c statement_timeout=5000 -c lock_timeout=3000")
        return self._pg

    def _reset_postgres(self) -> None:
        if self._pg is not None:
            try:
                self._pg.close()
            except Exception:
                pass
            self._pg = None

    def refresh_snapshot(self) -> None:
        now = time.time()
        if now - self._last_snapshot_refresh < self.snapshot_refresh_seconds:
            return
        self._last_snapshot_refresh = now
        try:
            pg = self._postgres()
            result = pg.execute("""
                SELECT snapshot_version, tombstone, payload, updated_at
                FROM paperclip_bridge_v1.read_snapshot(%s::uuid, %s, %s)
            """, (self.binding_id, self.binding_revision, self.snapshot_key))
            row = result.fetchone()
            pg.commit()
            if row is None:
                return
            snapshot_version, tombstone, payload, updated_at = row
            with closing(self._connect()) as db, db:
                db.execute("""
                    INSERT INTO snapshot_cache(snapshot_key,snapshot_version,tombstone,payload,updated_at,refreshed_at)
                    VALUES (?,?,?,?,?,?)
                    ON CONFLICT(snapshot_key) DO UPDATE SET snapshot_version=excluded.snapshot_version,
                      tombstone=excluded.tombstone,payload=excluded.payload,updated_at=excluded.updated_at,
                      refreshed_at=excluded.refreshed_at
                """, (self.snapshot_key, str(snapshot_version), int(bool(tombstone)),
                      _json(payload or {}), str(updated_at) if updated_at else None, now))
        except Exception:
            LOG.warning("Paperclip memory snapshot refresh failed; using the profile cache")
            self._reset_postgres()

    def cached_context(self) -> str | None:
        with closing(self._connect()) as db, db:
            row = db.execute("SELECT tombstone,payload FROM snapshot_cache WHERE snapshot_key=?",
                             (self.snapshot_key,)).fetchone()
        if row is None or row["tombstone"]:
            return None
        payload = json.loads(row["payload"])
        text = payload.get("context") or payload.get("text") or _json(payload)
        text = str(text)
        return text[:6000] if text else None

    def diagnostics(self) -> dict[str, Any]:
        with closing(self._connect()) as db, db:
            counts = db.execute("""SELECT COUNT(*) total,
                SUM(delivered_at IS NULL) pending,
                SUM(delivered_at IS NULL AND last_error IS NOT NULL) retrying,
                MAX(attempts) maxAttempts FROM event_queue""").fetchone()
            return {"profile": self.profile, "bindingId": self.binding_id,
                    "queued": counts["total"] or 0, "pending": counts["pending"] or 0,
                    "retrying": counts["retrying"] or 0, "maxAttempts": counts["maxAttempts"] or 0,
                    "database": self.db_path, "bindingRevision": self.binding_revision,
                    "databaseConfigured": bool(self.database_url)}

    def read_session_snapshot(self, session_id: str) -> dict[str, Any] | None:
        """Best-effort gap fill from Hermes state.db, opened strictly read-only."""
        hermes_home = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
        profile_db = hermes_home / "profiles" / self.profile / "state.db"
        db_path = profile_db if profile_db.is_file() else hermes_home / "state.db"
        if not db_path.is_file():
            return None
        uri = f"file:{quote(str(db_path), safe='/')}?mode=ro"
        try:
            with closing(sqlite3.connect(uri, uri=True, timeout=2)) as db, db:
                db.execute("PRAGMA query_only=ON")
                columns = {row[1] for row in db.execute('PRAGMA table_info("messages")')}
                required = {"session_id", "role", "content", "timestamp"}
                if not required.issubset(columns):
                    return None
                optional = [name for name in ("tool_name", "tool_calls", "tool_call_id", "reasoning") if name in columns]
                selected = ["role", "content", "timestamp", *optional]
                sql = f"SELECT {','.join(selected)} FROM messages WHERE session_id=? ORDER BY timestamp,rowid"
                rows = [dict(zip(selected, row)) for row in db.execute(sql, (session_id,))]
                return {"sessionId": session_id, "messages": rows} if rows else None
        except (sqlite3.Error, OSError):
            LOG.warning("Hermes state.db snapshot unavailable for profile %s", self.profile)
            return None


def _get_bridge() -> Bridge | None:
    global _bridge, _missing_config_logged
    with _lock:
        if _bridge is not None:
            return _bridge
        context = _plugin_context
        if context is None:
            return None
        get_config = getattr(context, "get_config", lambda _key, default=None: default)
        # Hermes secret settings are persisted in the Profile .env, rather
        # than returned by PluginContext.get_config.
        database_url = os.environ.get("PAPERCLIP_BRIDGE_DATABASE_URL", "") or get_config("database_url", "")
        db_path = get_config("queue_path", "")
        binding_id = get_config("binding_id", "")
        try:
            binding_revision = int(get_config("binding_revision", 0))
        except (ValueError, TypeError):
            binding_revision = 0
        snapshot_key = str(get_config("memory_snapshot_key", "memory"))
        try:
            snapshot_refresh_seconds = int(get_config("snapshot_refresh_seconds", 60))
        except (ValueError, TypeError):
            snapshot_refresh_seconds = 60
        if not db_path:
            home = os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))
            db_path = str(Path(home) / "paperclip-bridge" / "queue.sqlite3")
        try:
            binding_id = str(uuid.UUID(str(binding_id)))
        except (ValueError, TypeError, AttributeError):
            binding_id = ""
        if not binding_id or binding_revision < 1 or not database_url:
            if not _missing_config_logged:
                LOG.error("Paperclip Bridge requires a database secret, board-created binding_id and positive binding_revision")
                _missing_config_logged = True
            return None
        profile = str(getattr(context, "profile_name", None) or os.environ.get("HERMES_PROFILE", "default"))
        _bridge = Bridge(database_url, profile, binding_id,
                         binding_revision, db_path, snapshot_key, snapshot_refresh_seconds)
        return _bridge


def _capture(event_type: str, **payload: Any) -> None:
    bridge = _get_bridge()
    if not bridge:
        return
    session_id = payload.get("session_id") or payload.get("task_id")
    try:
        bridge.enqueue(event_type, str(session_id) if session_id else None, payload)
        _start_flusher(bridge)
    except Exception:
        LOG.exception("Paperclip Bridge could not persist %s", event_type)


def on_session_start(**kwargs: Any) -> None:
    _capture("session.started", **kwargs)


def pre_llm_call(**kwargs: Any) -> dict[str, str] | None:
    bridge = _get_bridge()
    if not bridge:
        return None
    _capture("conversation.turn.started", **kwargs)
    context = bridge.cached_context()
    return {"context": context} if context else None


def post_llm_call(**kwargs: Any) -> None:
    # Includes the complete conversation_history and assistant_response exposed
    # by Hermes' public hook contract, with no character clipping here.
    _capture("conversation.turn.completed", **kwargs)


def post_tool_call(**kwargs: Any) -> None:
    _capture("tool.completed", **kwargs)


def post_api_request(**kwargs: Any) -> None:
    _capture("model.request.completed", **kwargs)


def api_request_error(**kwargs: Any) -> None:
    _capture("model.request.failed", **kwargs)


def post_auxiliary_call(**kwargs: Any) -> None:
    _capture("model.auxiliary_request.completed", **kwargs)


def on_session_end(**kwargs: Any) -> None:
    _capture("session.ended", **kwargs)
    bridge = _get_bridge()
    session_id = kwargs.get("session_id")
    if bridge and session_id:
        snapshot = bridge.read_session_snapshot(str(session_id))
        if snapshot:
            _capture("session.backfill.snapshot", session_id=str(session_id), snapshot=snapshot)


def on_session_reset(**kwargs: Any) -> None:
    _capture("session.reset", **kwargs)


def _start_flusher(bridge: Bridge) -> None:
    """Keep network retries off the Hermes model/tool callback path."""
    global _flusher_started, _flusher_stop, _flusher_thread
    with _lock:
        if _flusher_started:
            return
        _flusher_started = True
        stop = threading.Event()
        _flusher_stop = stop

    def run() -> None:
        while not stop.is_set():
            try:
                bridge.flush(limit=100, max_bytes=1024 * 1024)
            except Exception:
                LOG.exception("Paperclip Bridge queue flush failed")
            stop.wait(_flush_seconds)
        bridge._reset_postgres()

    _flusher_thread = threading.Thread(target=run, name="paperclip-bridge-flusher", daemon=True)
    _flusher_thread.start()


def _stop_flusher() -> None:
    global _flusher_started
    if _flusher_stop is not None:
        _flusher_stop.set()
    if _flusher_thread is not None and _flusher_thread is not threading.current_thread():
        _flusher_thread.join(timeout=10)
    _flusher_started = False


def register(ctx: Any) -> None:
    global _bridge, _flusher_started, _plugin_context, _missing_config_logged, _flush_seconds
    _stop_flusher()
    _bridge = None
    _flusher_started = False
    _missing_config_logged = False
    _plugin_context = ctx
    get_config = getattr(ctx, "get_config", lambda _key, default=None: default)
    try:
        _flush_seconds = min(2, max(0.1, float(get_config("flush_seconds", 2))))
    except (ValueError, TypeError):
        _flush_seconds = 2
    for hook, handler in (
        ("pre_llm_call", pre_llm_call),
        ("on_session_start", on_session_start),
        ("post_llm_call", post_llm_call),
        ("post_tool_call", post_tool_call),
        ("post_api_request", post_api_request),
        ("api_request_error", api_request_error),
        ("post_auxiliary_call", post_auxiliary_call),
        ("on_session_end", on_session_end),
        ("on_session_reset", on_session_reset),
    ):
        ctx.register_hook(hook, handler)
    on_unload = getattr(ctx, "on_unload", None)
    if callable(on_unload):
        on_unload(_stop_flusher)
    bridge = _get_bridge()
    if bridge is not None:
        _start_flusher(bridge)
