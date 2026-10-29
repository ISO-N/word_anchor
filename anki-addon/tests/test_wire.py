"""线格式与字段清洗的单测，不需要 Anki 环境：

    python -m unittest discover anki-addon/tests
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "word_anchor_sync"
sys.path.insert(0, str(PACKAGE))

import capture  # noqa: E402
import queue_store  # noqa: E402
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

    def test_captured_at_is_optional_and_kept_when_present(self):
        stamp = "2024-05-01T09:00:00.000+00:00"
        payload = wire.encode_payload(
            [
                {"term": "lucid", "meaning": "清晰", "capturedAt": stamp},
                {"term": "vivid", "meaning": "生动的"},
            ]
        )
        words = wire.decode_payload(payload)["words"]

        # 词锚靠它区分「重发」与「又忘了一次」，缺省时干脆不写这个键
        self.assertEqual(words[0]["capturedAt"], stamp)
        self.assertNotIn("capturedAt", words[1])


class ManifestTest(unittest.TestCase):
    """版本范围必须让当前 Anki 肯加载这个插件。

    Anki 的 `AddonMeta.compatible()`（qt/aqt/addons.py）里有这么一段：
        if max is not None and max < 0 and _current_version > abs(max):
            return False
    也就是负数 `max_point_version` 会被读成「abs(n) 是最后一个支持版本」，
    所以 -1 等于「只支持 Anki 2.1.1」——插件会被静默跳过，附加组件对话框
    提示「这个附加组件需要旧版本的 Anki」。无上限就用 0（或正数）。
    """

    def setUp(self):
        self.manifest = json.loads((PACKAGE / "manifest.json").read_text("utf-8"))

    def test_max_point_version_is_not_a_negative_cap(self):
        self.assertGreaterEqual(self.manifest.get("max_point_version", 0), 0)

    def test_min_point_version_accepts_current_anki(self):
        # 当前 Anki 的 int_version() 远大于 50，这里只锁住「不要写成大数字」
        self.assertEqual(self.manifest.get("min_point_version"), 50)

    def test_package_matches_folder_name(self):
        self.assertEqual(self.manifest.get("package"), PACKAGE.name)


class QueueStoreTest(unittest.TestCase):
    """队列只写临时目录，不往仓库里落文件。"""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "queue.json"
        self._original_path = queue_store.queue_path
        queue_store.queue_path = lambda: self.path

    def tearDown(self):
        queue_store.queue_path = self._original_path
        self.temp.cleanup()

    def test_recapture_refreshes_timestamp_and_marks_pending_again(self):
        queue_store.add("Lucid", "清晰易懂的", 1)
        first = queue_store.pending()[0]
        queue_store.mark_sent(["Lucid"])

        self.assertEqual(queue_store.pending(), [])

        queue_store.add("lucid", "清晰易懂的", 1)
        again = queue_store.pending()

        self.assertEqual(len(queue_store.load()["items"]), 1)
        self.assertEqual(len(again), 1)
        self.assertIsNone(again[0]["sentAt"])
        # 毫秒精度：同一秒内再次抓取也能与上一次区分开
        self.assertGreaterEqual(again[0]["capturedAt"], first["capturedAt"])
        self.assertIn(".", again[0]["capturedAt"])


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


class LabelPrefixTest(unittest.TestCase):
    """字段内容里的「释义：」这类标签不能进词库。"""

    def test_separators_are_handled(self):
        labels = capture.label_list("", ["释义"])

        for raw in ("释义：意外发现", "释义: 意外发现", "释义 意外发现", "释义\n意外发现"):
            self.assertEqual(capture.strip_label_prefix(raw, labels), "意外发现")

    def test_field_name_is_a_label(self):
        self.assertEqual(
            capture.strip_label_prefix("Meaning: obvious", capture.label_list("Meaning", [])),
            "obvious",
        )
        self.assertEqual(
            capture.strip_label_prefix("释义：清晰", capture.label_list("释义", [])),
            "清晰",
        )

    def test_bracketed_labels_are_handled(self):
        self.assertEqual(
            capture.strip_label_prefix("【释义】清晰易懂", capture.label_list("", ["释义"])),
            "清晰易懂",
        )
        self.assertEqual(
            capture.strip_label_prefix(
                "[Meaning] clear", capture.label_list("", ["Meaning"])
            ),
            "clear",
        )

    def test_longer_label_wins(self):
        labels = capture.label_list("", ["释义", "中文释义"])

        self.assertEqual(capture.strip_label_prefix("中文释义：清晰", labels), "清晰")

    def test_real_content_is_not_mangled(self):
        labels = capture.label_list("释义", ["释义"])

        self.assertEqual(capture.strip_label_prefix("释义学导论", labels), "释义学导论")
        self.assertEqual(capture.strip_label_prefix("释义", labels), "释义")
        self.assertEqual(
            capture.strip_label_prefix("并不是释义：这句话", labels), "并不是释义：这句话"
        )

    def test_html_label_is_stripped_too(self):
        labels = capture.label_list("释义", [])

        self.assertEqual(capture.clean_meaning("<b>释义</b>：清晰易懂", labels), "清晰易懂")

    def test_entry_from_card_strips_both_labels(self):
        card = FakeCard({"单词": "单词：lucid", "释义": "释义：清晰易懂的"})

        entry = capture.entry_from_card(card, "单词", "释义")

        self.assertEqual(entry["term"], "lucid")
        self.assertEqual(entry["meaning"], "清晰易懂的")

    def test_old_queue_values_are_cleaned_before_send(self):
        cleaned = capture.clean_entry("单词：lucid", "释义：清晰易懂的", "单词", "释义")

        self.assertEqual(cleaned, {"term": "lucid", "meaning": "清晰易懂的"})


class DeckWhitelistTest(unittest.TestCase):
    """白名单是纯字符串逻辑，不需要 Anki：牌组名从卡片里拿出来后才进来。"""

    def test_empty_whitelist_allows_every_deck(self):
        # 旧行为：没配白名单就不限制
        self.assertTrue(capture.deck_allowed("随便一个牌组", []))
        self.assertTrue(capture.deck_allowed("随便一个牌组", None))
        self.assertTrue(capture.deck_allowed("", []))

    def test_exact_name_and_its_subdecks_pass(self):
        whitelist = ["英语"]

        self.assertTrue(capture.deck_allowed("英语", whitelist))
        self.assertTrue(capture.deck_allowed("英语::单词", whitelist))
        self.assertTrue(capture.deck_allowed("英语::单词::难词", whitelist))
        self.assertFalse(capture.deck_allowed("日语", whitelist))

    def test_sibling_sharing_prefix_is_not_a_subdeck(self):
        # 只有 :: 才算子牌组，「英语」不该把「英语角」带进来
        self.assertFalse(capture.deck_allowed("英语角", ["英语"]))
        self.assertFalse(capture.deck_allowed("英语角::单词", ["英语"]))

    def test_subdeck_matching_can_be_disabled(self):
        self.assertFalse(capture.deck_allowed("英语::单词", ["英语"], False))
        self.assertTrue(capture.deck_allowed("英语::单词", ["英语::单词"], False))
        self.assertTrue(capture.deck_allowed("英语", ["英语"], False))

    def test_case_and_surrounding_spaces_are_ignored(self):
        self.assertTrue(capture.deck_allowed("English", [" english "]))
        self.assertTrue(capture.deck_allowed("ENGLISH::Words", ["english"]))
        self.assertTrue(capture.deck_allowed(" 英语 ", ["英语"]))

    def test_hand_written_string_config_works(self):
        # 用户把配置写成 "英语" 而不是 ["英语"] 也不能崩
        self.assertTrue(capture.deck_allowed("英语", "英语"))
        self.assertFalse(capture.deck_allowed("日语", "英语"))

    def test_unreadable_deck_name_is_rejected(self):
        self.assertFalse(capture.deck_allowed("", ["英语"]))
        self.assertFalse(capture.deck_allowed(None, ["英语"]))

    def test_normalize_drops_noise(self):
        self.assertEqual(
            capture.normalize_whitelist([" 英语 ", "", None, 42, "英语", "English"]),
            ["英语", "english"],
        )
        self.assertEqual(capture.normalize_whitelist([]), [])
        self.assertEqual(capture.normalize_whitelist(None), [])


if __name__ == "__main__":
    unittest.main()
