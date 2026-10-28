"""词锚收录的线格式 v1。

与站点 `src/lib/intake.ts` 严格一致：任何一个字段的改动都必须两边同时改，
两边各有一份测试守住它（`src/lib/intake.test.ts` / `tests/test_wire.py`）。

这个模块只依赖标准库 —— 不要在这里 import aqt / anki，
否则它就没法脱离 Anki 跑单测了。
"""

from __future__ import annotations

import base64
import json

WIRE_PREFIX = "word-anchor:v1"
WIRE_VERSION = 1
MAX_ENTRIES = 200
MAX_TERM_LENGTH = 80
MAX_MEANING_LENGTH = 300
MAX_PAYLOAD_CHARS = 12000


def truncate(value: str, limit: int) -> str:
    return value[:limit] if len(value) > limit else value


def normalize_site_url(value: str) -> str:
    """补全协议与结尾斜杠：用户多半只会粘贴 `someone.github.io/word_anchor`。"""
    url = (value or "").strip()
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    return url if url.endswith("/") else url + "/"


def encode_payload(words) -> str:
    """把词条编成 base64url（无 padding）的 JSON。"""
    body = {
        "v": WIRE_VERSION,
        "source": "anki",
        "words": [
            {
                "term": truncate(str(word["term"]), MAX_TERM_LENGTH),
                "meaning": truncate(str(word["meaning"]), MAX_MEANING_LENGTH),
            }
            for word in list(words)[:MAX_ENTRIES]
        ],
    }
    raw = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def clipboard_envelope(words) -> str:
    return "{}\n{}".format(WIRE_PREFIX, encode_payload(words))


def deep_link(site_url: str, words) -> str:
    return "{}#inbox={}".format(normalize_site_url(site_url), encode_payload(words))


def decode_payload(payload: str) -> dict:
    """只给测试与排障用：把 payload 解回 dict。"""
    padded = payload + "=" * (-len(payload) % 4)
    raw = base64.urlsafe_b64decode(padded.encode("ascii"))

    return json.loads(raw.decode("utf-8"))
