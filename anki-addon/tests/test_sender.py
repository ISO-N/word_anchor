"""sender 的单测：注入 transport，不需要 Anki，也不需要真的开端口。

    python -m unittest discover anki-addon/tests
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "word_anchor_sync"
sys.path.insert(0, str(PACKAGE))

import queue_store  # noqa: E402
import sender  # noqa: E402
import wire  # noqa: E402


class FakeTransport:
    """记录调用、按预设返回；`error` 模拟连接被拒/超时。"""

    def __init__(self, status=200, payload=b"", error=None):
        self.status = status
        self.payload = payload
        self.error = error
        self.calls = []

    def post(self, url, body, timeout):
        self.calls.append({"method": "POST", "url": url, "body": body, "timeout": timeout})
        if self.error is not None:
            raise self.error
        return self.status, self.payload

    def get(self, url, timeout):
        self.calls.append({"method": "GET", "url": url, "body": None, "timeout": timeout})
        if self.error is not None:
            raise self.error
        return self.status, self.payload


class SenderTestCase(unittest.TestCase):
    """队列写临时目录、端口文件也放临时目录，绝不碰仓库与真实 APPDATA。"""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "queue.json"
        self._original_queue_path = queue_store.queue_path
        queue_store.queue_path = lambda: self.path

        self.port_file = Path(self.temp.name) / "port"
        self._original_env = os.environ.get(sender.PORT_FILE_ENV)
        os.environ[sender.PORT_FILE_ENV] = str(self.port_file)

    def tearDown(self):
        queue_store.queue_path = self._original_queue_path
        if self._original_env is None:
            os.environ.pop(sender.PORT_FILE_ENV, None)
        else:
            os.environ[sender.PORT_FILE_ENV] = self._original_env
        self.temp.cleanup()

    def conf(self, **overrides):
        base = {
            "api_base": "",
            "push_timeout": 2.0,
            "term_field": "",
            "meaning_field": "",
        }
        base.update(overrides)
        return base


class BaseUrlTest(SenderTestCase):
    def test_explicit_api_base_wins(self):
        self.port_file.write_text("8773", "utf-8")

        self.assertEqual(
            sender.resolve_base_url(self.conf(api_base="127.0.0.1:8811")),
            "http://127.0.0.1:8811",
        )

    def test_port_file_is_used_when_api_base_is_empty(self):
        self.port_file.write_text("8773\n", "utf-8")

        self.assertEqual(sender.resolve_base_url(self.conf()), "http://127.0.0.1:8773")

    def test_broken_port_file_falls_back_to_8770(self):
        for content in ("", "not-a-port", "9999", "1234"):
            self.port_file.write_text(content, "utf-8")
            self.assertEqual(
                sender.resolve_base_url(self.conf()), "http://127.0.0.1:8770", content
            )

    def test_missing_port_file_falls_back_to_8770(self):
        self.assertFalse(self.port_file.exists())
        self.assertEqual(sender.resolve_base_url(self.conf()), "http://127.0.0.1:8770")

    def test_port_file_path_honours_the_env_override(self):
        self.assertEqual(sender.port_file_path(), self.port_file)


class TimeoutTest(SenderTestCase):
    def test_default_and_clamped_timeouts(self):
        self.assertEqual(sender.push_timeout({}), 2.0)
        self.assertEqual(sender.push_timeout({"push_timeout": 1.5}), 1.5)
        self.assertEqual(sender.push_timeout({"push_timeout": 99}), 10.0)
        self.assertEqual(sender.push_timeout({"push_timeout": 0}), 0.5)
        self.assertEqual(sender.push_timeout({"push_timeout": "junk"}), 2.0)


class EntriesTest(SenderTestCase):
    def test_labels_are_cleaned_and_captured_at_kept(self):
        items = [
            {"term": "单词：lucid", "meaning": "释义：清晰易懂的", "capturedAt": "2024-05-01T09:00:00.000+00:00"},
            {"term": "vivid", "meaning": "生动的"},
        ]

        entries = sender.entries_for(items, self.conf(term_field="单词", meaning_field="释义"))

        self.assertEqual(
            entries[0], {"term": "lucid", "meaning": "清晰易懂的", "capturedAt": "2024-05-01T09:00:00.000+00:00"}
        )
        self.assertEqual(entries[1], {"term": "vivid", "meaning": "生动的"})


class PushTest(SenderTestCase):
    def test_empty_queue_does_not_touch_the_network(self):
        transport = FakeTransport()

        result = sender.push_pending(self.conf(), transport)

        self.assertEqual(result.status, "empty")
        self.assertEqual(transport.calls, [])

    def test_success_marks_which_terms_were_sent(self):
        queue_store.add("Lucid", "清晰易懂的", 1)
        queue_store.add("vivid", "生动的", 2)
        transport = FakeTransport(200, b'{"accepted":2}')

        result = sender.push_pending(self.conf(api_base="127.0.0.1:8771"), transport)

        self.assertTrue(result.ok)
        self.assertEqual(result.accepted, 2)
        self.assertEqual(result.terms, ("Lucid", "vivid"))
        # 用队列里的原始 term 标记已发送：清洗可能改写过 term
        queue_store.mark_sent(result.terms)
        self.assertEqual(queue_store.pending(), [])

        call = transport.calls[0]
        self.assertEqual(call["url"], "http://127.0.0.1:8771/api/v1/intake")
        self.assertEqual(call["timeout"], 2.0)

        body = json.loads(call["body"])
        self.assertEqual(body["v"], 1)
        self.assertEqual(body["source"], "anki")
        self.assertEqual(body["words"][0]["term"], "Lucid")
        self.assertIn("capturedAt", body["words"][0])

    def test_bad_request_keeps_the_queue_for_the_next_retry(self):
        queue_store.add("lucid", "清晰易懂的", 1)
        transport = FakeTransport(400, b'{"error":"\\u4e00\\u6b21\\u6700\\u591a\\u63a8\\u9001 200 \\u4e2a\\u5355\\u8bcd"}')

        result = sender.push_pending(self.conf(), transport)

        self.assertFalse(result.ok)
        self.assertEqual(result.status, "http_error")
        self.assertIn("200", result.error)
        self.assertEqual(len(queue_store.pending()), 1)

    def test_non_json_error_body_still_reports_the_status(self):
        queue_store.add("lucid", "清晰易懂的", 1)
        transport = FakeTransport(404, b"not found")

        result = sender.push_pending(self.conf(), transport)

        self.assertEqual(result.status, "http_error")
        self.assertEqual(result.error, "HTTP 404")

    def test_connection_failure_is_silent_for_the_user(self):
        queue_store.add("lucid", "清晰易懂的", 1)
        transport = FakeTransport(error=TimeoutError("timed out"))

        result = sender.push_pending(self.conf(), transport)

        self.assertEqual(result.status, "network_error")
        self.assertIn("timed out", result.error)
        self.assertEqual(len(queue_store.pending()), 1)

    def test_only_the_first_200_entries_are_sent(self):
        for index in range(205):
            queue_store.add("word-{}".format(index), "释义", index)

        transport = FakeTransport(200, b'{"accepted":200}')
        result = sender.push_pending(self.conf(), transport)

        self.assertEqual(len(result.terms), wire.MAX_ENTRIES)
        self.assertEqual(len(queue_store.pending()), 205)
        self.assertEqual(len(json.loads(transport.calls[0]["body"])["words"]), 200)

    def test_oversized_body_is_refused_before_sending(self):
        queue_store.add("lucid", "义" * wire.MAX_MEANING_LENGTH, 1)
        transport = FakeTransport()

        original = wire.encode_payload
        wire.encode_payload = lambda _words: "x" * (wire.MAX_BODY_BYTES + 1)
        try:
            result = sender.push_pending(self.conf(), transport)
        finally:
            wire.encode_payload = original

        self.assertEqual(result.status, "http_error")
        self.assertIn("512KB", result.error)
        self.assertEqual(transport.calls, [])


class HealthTest(SenderTestCase):
    def test_ok(self):
        transport = FakeTransport(200, b'{"ok":true,"app":"word-anchor","port":8770}')

        ok, detail = sender.check_health("http://127.0.0.1:8770", transport=transport)

        self.assertTrue(ok)
        self.assertEqual(detail, "127.0.0.1:8770")
        self.assertEqual(transport.calls[0]["url"], "http://127.0.0.1:8770/api/v1/health")

    def test_http_error(self):
        ok, detail = sender.check_health(
            "http://127.0.0.1:8770", transport=FakeTransport(403, b'{"error":"Origin"}')
        )

        self.assertFalse(ok)
        self.assertEqual(detail, "HTTP 403")

    def test_non_json_body(self):
        ok, detail = sender.check_health(
            "http://127.0.0.1:8770", transport=FakeTransport(200, b"<html></html>")
        )

        self.assertFalse(ok)
        self.assertEqual(detail, "返回内容不是 JSON")

    def test_connection_refused(self):
        ok, detail = sender.check_health(
            "http://127.0.0.1:8770",
            transport=FakeTransport(error=ConnectionRefusedError("拒绝连接")),
        )

        self.assertFalse(ok)
        self.assertIn("拒绝连接", detail)


if __name__ == "__main__":
    unittest.main()
