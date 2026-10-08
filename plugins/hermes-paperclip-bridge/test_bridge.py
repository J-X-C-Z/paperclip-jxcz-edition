"""Offline regression checks for the durable Hermes Bridge queue."""

import json
import importlib.util
import tempfile
import unittest
import sqlite3
from unittest.mock import patch
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("__init__.py")
SPEC = importlib.util.spec_from_file_location("hermes_paperclip_bridge", MODULE_PATH)
bridge_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge_module)


class FakePostgres:
    closed = False

    def __init__(self):
        self.deliveries = []

    def execute(self, _sql, params):
        self.deliveries.append(params)
        return self

    def fetchone(self):
        return ("remote-event-1", False)

    def commit(self):
        pass


class BridgeQueueTests(unittest.TestCase):
    def make_bridge(self, path):
        return bridge_module.Bridge(
            "postgresql://unused", "default", "00000000-0000-0000-0000-000000000001",
            1, str(path), "memory", 60,
        )

    def test_native_id_is_idempotent_across_restart_and_flush(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.sqlite3"
            first = self.make_bridge(path)
            first.enqueue("model.request.completed", "session-1", {"request_id": "req-1", "usage": {"input": 3}})
            restarted = self.make_bridge(path)
            restarted.enqueue("model.request.completed", "session-1", {"request_id": "req-1", "usage": {"input": 3}})
            self.assertEqual(restarted.diagnostics()["pending"], 1)

            fake = FakePostgres()
            restarted._postgres = lambda: fake
            restarted.refresh_snapshot = lambda: None
            restarted.flush()
            self.assertEqual(len(fake.deliveries), 1)
            self.assertEqual(restarted.diagnostics()["pending"], 0)
            self.assertEqual(fake.deliveries[0][6], json.loads(
                self._queued_payload(path)
            )["source_key"])

    def test_conflicting_replay_and_oversized_event_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.make_bridge(Path(directory) / "queue.sqlite3")
            bridge.enqueue("tool.completed", "session-1", {"tool_call_id": "call-1", "result": "ok"})
            with self.assertRaisesRegex(ValueError, "different content"):
                bridge.enqueue("tool.completed", "session-1", {"tool_call_id": "call-1", "result": "changed"})
            with self.assertRaisesRegex(ValueError, "64 KiB"):
                bridge.enqueue("tool.completed", "session-1", {"response": "x" * (70 * 1024)})
            self.assertEqual(bridge.diagnostics()["pending"], 1)

    def test_native_replay_preserves_original_time_across_seconds(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.sqlite3"
            bridge = self.make_bridge(path)
            payload = {"api_request_id": "native-hermes-request", "usage": {"input": 3}}
            with patch.object(bridge_module.time, "strftime", return_value="2026-10-04T00:00:01Z"):
                bridge.enqueue("model.request.completed", "session-1", payload)
            first = self._queued_payload(path)
            with patch.object(bridge_module.time, "strftime", return_value="2026-10-04T00:00:02Z"):
                self.make_bridge(path).enqueue("model.request.completed", "session-1", payload)
            self.assertEqual(self._queued_payload(path), first)
            self.assertEqual(bridge.diagnostics()["pending"], 1)

    def test_same_native_id_in_distinct_sessions_does_not_collide(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.make_bridge(Path(directory) / "queue.sqlite3")
            for session in ("s1", "s2"):
                bridge.enqueue("model.request.completed", session, {"api_request_id": "same"})
            self.assertEqual(bridge.diagnostics()["pending"], 2)

    def test_auxiliary_physical_retries_keep_distinct_usage_events(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.make_bridge(Path(directory) / "queue.sqlite3")
            for attempt in (0, 1):
                bridge.enqueue("model.auxiliary_request.completed", "s", {"api_request_id": "same", "retry_count": attempt, "api_call_count": attempt + 1})
            self.assertEqual(bridge.diagnostics()["pending"], 2)

    def test_unload_stops_background_flusher(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.make_bridge(Path(directory) / "queue.sqlite3")
            bridge.flush = lambda **_kwargs: None
            bridge_module._start_flusher(bridge)
            self.assertTrue(bridge_module._flusher_thread.is_alive())
            bridge_module._stop_flusher()
            self.assertFalse(bridge_module._flusher_thread.is_alive())

    def test_large_unicode_conversation_is_durable_chunked_and_replayable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.sqlite3"
            bridge = self.make_bridge(path)
            payload = {"turn_id": "turn-1", "assistant_response": '正文\\"🙂' * 20000,
                       "conversation_history": [{"role": "user", "content": "原始要求"}]}
            bridge.enqueue("conversation.turn.completed", "session-1", payload)
            with sqlite3.connect(path) as db:
                rows = [json.loads(row[0]) for row in db.execute("SELECT payload FROM event_queue ORDER BY created_at")]
            self.assertGreater(len(rows), 1)
            self.assertTrue(all(len(bridge_module._json(row).encode("utf-8")) <= 65536 for row in rows))
            self.assertTrue(all(row["event_kind"] == "conversation.turn.chunk" for row in rows))
            text = "".join(row["payload"]["text"] for row in sorted(rows, key=lambda row: row["payload"]["chunk_index"]))
            self.assertEqual(json.loads(text)["assistant_response"], payload["assistant_response"])
            restarted = self.make_bridge(path)
            restarted.enqueue("conversation.turn.completed", "session-1", payload)
            self.assertEqual(restarted.diagnostics()["pending"], len(rows))

    def test_failed_remote_commit_keeps_event_for_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.sqlite3"
            bridge = self.make_bridge(path)
            bridge.enqueue("tool.completed", "s", {"tool_call_id": "tool-1"})
            fake = FakePostgres()
            fake.commit = lambda: (_ for _ in ()).throw(ConnectionError("commit unavailable"))
            bridge._postgres = lambda: fake
            bridge.refresh_snapshot = lambda: None
            bridge.flush()
            self.assertEqual(bridge.diagnostics()["pending"], 1)
            self.assertEqual(bridge.diagnostics()["retrying"], 1)
            with sqlite3.connect(path) as db:
                attempts, delivered, retry_at = db.execute("SELECT attempts,delivered_at,next_attempt_at FROM event_queue").fetchone()
            self.assertEqual(attempts, 1)
            self.assertIsNone(delivered)
            self.assertGreater(retry_at, 0)

    def test_redacts_secrets_before_local_persistence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.sqlite3"
            bridge = self.make_bridge(path)
            bridge.enqueue("tool.completed", "s", {"api_key": "sensitive-value", "request": {"Authorization": "Bearer sensitive"}, "text": "Bearer abc-token"})
            text = self._queued_payload(path)
            self.assertNotIn("sensitive", text)
            self.assertNotIn("abc-token", text)
            self.assertIn("[REDACTED]", text)

    def test_cached_role_context_survives_restart_and_offline_refresh(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue.sqlite3"
            bridge = self.make_bridge(path)
            fake = FakePostgres()
            fake.fetchone = lambda: (7, False, {"context": "离线角色规则"}, "2026-10-04")
            bridge._postgres = lambda: fake
            bridge.refresh_snapshot()
            restarted = self.make_bridge(path)
            restarted._postgres = lambda: (_ for _ in ()).throw(ConnectionError("offline"))
            restarted.refresh_snapshot()
            self.assertEqual(restarted.cached_context(), "离线角色规则")

    def test_tombstone_removes_cached_role_context(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge = self.make_bridge(Path(directory) / "queue.sqlite3")
            fake = FakePostgres()
            fake.fetchone = lambda: (8, True, {}, "2026-10-04")
            bridge._postgres = lambda: fake
            bridge.refresh_snapshot()
            self.assertIsNone(bridge.cached_context())

    def test_public_profile_context_secret_env_and_unload_registration(self):
        with tempfile.TemporaryDirectory() as directory:
            class Context:
                profile_name = "cloud-bot"
                def __init__(self): self.hooks = {}; self.cleanup = None
                def get_config(self, key, default=None):
                    return {"binding_id": "00000000-0000-0000-0000-000000000001", "binding_revision": 1,
                            "queue_path": str(Path(directory) / "queue.sqlite3")}.get(key, default)
                def register_hook(self, name, handler): self.hooks[name] = handler
                def on_unload(self, handler): self.cleanup = handler
            context = Context()
            with patch.dict(bridge_module.os.environ, {"PAPERCLIP_BRIDGE_DATABASE_URL": "postgresql://unused"}), patch.object(bridge_module, "_start_flusher"):
                bridge_module.register(context)
                self.assertEqual(bridge_module._get_bridge().profile, "cloud-bot")
                self.assertEqual(bridge_module._get_bridge().database_url, "postgresql://unused")
            self.assertTrue(callable(context.cleanup))
            self.assertIn("post_auxiliary_call", context.hooks)
            self.assertIn("post_api_request", context.hooks)
            context.cleanup()
            bridge_module._bridge = None
            bridge_module._plugin_context = None

    @staticmethod
    def _queued_payload(path):
        import sqlite3

        with sqlite3.connect(path) as db:
            return db.execute("SELECT payload FROM event_queue").fetchone()[0]


if __name__ == "__main__":
    unittest.main()
