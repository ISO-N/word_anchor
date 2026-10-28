"""线格式与字段清洗的单测，不需要 Anki 环境：

    python -m unittest discover anki-addon/tests
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "word_anchor_sync"
sys.path.insert(0, str(PACKAGE))

import capture  # noqa: E402
import wire  # noqa: E402


class FakeNote(dict):
    def keys(self):  # dict.keys() 给的是视图，Anki 的 Note.keys() 是列表
        return list(dict.keys(self))


class FakeCard:
    nid = 42

    def __init__(self, fields):
        self._note = FakeNote(fields)

    def note(self):
        return self._note


class WireTest(unittest.TestCase):
    def test_clipboard_envelope_starts_with_prefix(self):
        envelope = wire.clipboard_envelope([{"term": "lucid", "meaning": "清晰"}])
        first, second = envelope.split("\n")

        self.assertEqual(first, wire.WIRE_PREFIX)
        self.assertTrue(second)

    def test_roundtrip_keeps_chinese_and_emoji(self):
        entries = [
            {"term": "naïve", "meaning": "天真的 🍀"},
            {"term": "lucid", "meaning": "清晰易懂的\n第二行"},
        ]

        payload = wire.encode_payload(entries)
        decoded = wire.decode_payload(payload)

        self.assertEqual(decoded["v"], wire.WIRE_VERSION)
        self.assertEqual(decoded["source"], "anki")
        self.assertEqual(decoded["words"], entries)

    def test_payload_is_url_safe(self):
        payload = wire.encode_payload([{"term": "亯亯", "meaning": "丿丿丿"}])

        self.assertNotIn("+", payload)
        self.assertNotIn("/", payload)
        self.assertNotIn("=", payload)
        self.assertEqual(wire.decode_payload(payload)["words"][0]["term"], "亯亯")

    def test_deep_link_normalizes_site_url(self):
        words = [{"term": "lucid", "meaning": "清晰"}]

        self.assertEqual(
            wire.deep_link("someone.github.io/word_anchor", words),
            "https://someone.github.io/word_anchor/#inbox="
            + wire.encode_payload(words),
        )
        self.assertEqual(
            wire.deep_link("https://example.com/app/", words),
            "https://example.com/app/#inbox=" + wire.encode_payload(words),
        )
        self.assertEqual(wire.normalize_site_url("   "), "")

    def test_payload_truncates_overlong_fields(self):
        payload = wire.encode_payload(
            [{"term": "a" * 90, "meaning": "义" * 320}]
        )
        word = wire.decode_payload(payload)["words"][0]

        self.assertEqual(len(word["term"]), wire.MAX_TERM_LENGTH)
        self.assertEqual(len(word["meaning"]), wire.MAX_MEANING_LENGTH)


class CaptureTest(unittest.TestCase):
    def test_strip_html_keeps_line_breaks_and_entities(self):
        self.assertEqual(
            capture.strip_html("清晰<br>易懂 &amp; 常见"),
            "清晰\n易懂 & 常见",
        )
        self.assertEqual(
            capture.strip_html("第一义项</li><li>第二义项"),
            "第一义项\n第二义项",
        )

    def test_strip_html_removes_sound_tags(self):
        self.assertEqual(
            capture.strip_html("lucid [sound:lucid.mp3]"),
            "lucid",
        )

    def test_clean_term_is_single_line(self):
        self.assertEqual(capture.clean_term("line one<br>line two"), "line one line two")

    def test_pick_fields_falls_back_to_first_two(self):
        self.assertEqual(
            capture.pick_fields(["单词", "释义", "例句"], "", ""),
            ("单词", "释义"),
        )
        self.assertEqual(
            capture.pick_fields(["单词", "释义"], "不存在", "释义"),
            ("单词", "释义"),
        )
        self.assertEqual(
            capture.pick_fields(["单词"], "", ""),
            ("单词", ""),
        )

    def test_entry_from_card_uses_configured_fields(self):
        card = FakeCard(
            {
                "Word": "<b>lucid</b>",
                "Meaning": "清晰易懂的<br>条理清楚的",
                "Extra": "不该被选中的字段",
            }
        )

        entry = capture.entry_from_card(card, "Word", "Meaning")

        self.assertEqual(entry["term"], "lucid")
        self.assertEqual(entry["meaning"], "清晰易懂的\n条理清楚的")
        self.assertEqual(entry["noteId"], 42)

    def test_entry_from_card_returns_none_when_meaning_is_empty(self):
        card = FakeCard({"Word": "lucid", "Meaning": "   "})

        self.assertIsNone(capture.entry_from_card(card, "", ""))


if __name__ == "__main__":
    unittest.main()
