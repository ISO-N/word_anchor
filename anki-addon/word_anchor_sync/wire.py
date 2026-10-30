"""词锚收录的线格式 v1。

与桌面端 `src/lib/intake.ts`、Rust 侧 `src-tauri/src/api.rs` 严格一致：
任何一个字段的改动都必须三边同时改，三边各有一份测试守住它
（`src/lib/intake.test.ts` / `src-tauri/src/api.rs` / `tests/test_wire.py`）。

一份 payload 就是本机 HTTP API 的 JSON body：

    {"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的","capturedAt":"2024-05-01T09:00:00.000+00:00"}]}

`capturedAt` 可选：词锚靠它区分「重发」（时间没变）与「又忘了」（时间更新）。

这个模块只依赖标准库 —— 不要在这里 import aqt / anki，
否则它就没法脱离 Anki 跑单测了。
"""

from __future__ import annotations

import json

WIRE_VERSION = 1
WIRE_SOURCE = "anki"
MAX_ENTRIES = 200
MAX_TERM_LENGTH = 80
MAX_MEANING_LENGTH = 300
MAX_BODY_BYTES = 512 * 1024

DEFAULT_PORT = 8770
PORT_MIN = 8770
PORT_MAX = 8789

ENDPOINT_INTAKE = "/api/v1/intake"
ENDPOINT_HEALTH = "/api/v1/health"


def truncate(value: str, limit: int) -> str:
    return value[:limit] if len(value) > limit else value


def normalize_api_url(value: str) -> str:
    """补全协议、去掉结尾斜杠：用户多半只会粘贴 `127.0.0.1:8770`。

    留空是合法输入 —— 意思是「自动发现端口文件」。
    顺手容忍把完整的 `/api/v1/intake` 地址粘进来（重复拼接会 404）。
    """
    url = (value or "").strip()
    if not url:
        return ""

    lowered = url.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        pass
    elif "://" in url:
        # 不是 http(s) 的协议：多半是粘错了，按主机名处理
        url = "http://" + url.split("://", 1)[1]
    else:
        url = "http://" + url

    url = url.rstrip("/")
    for suffix in (ENDPOINT_INTAKE, "/api/v1"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
            break

    return url.rstrip("/")


def encode_payload(words) -> str:
    """把词条编成 JSON body（UTF-8 字符串）。

    `capturedAt` 是可选字段：带上它，词锚才能区分「重新发送全部」这种重发
    （时间没变）与「又按了一次重来」（时间更新），只有后者会把词挪到队尾。
    超过 200 条时只取前 200 条：剩下的仍留在队列里，下一次推送继续。
    """
    body = {
        "v": WIRE_VERSION,
        "source": WIRE_SOURCE,
        "words": [_encode_entry(word) for word in list(words)[:MAX_ENTRIES]],
    }

    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


def _encode_entry(word) -> dict:
    entry = {
        "term": truncate(str(word["term"]), MAX_TERM_LENGTH),
        "meaning": truncate(str(word["meaning"]), MAX_MEANING_LENGTH),
    }

    captured_at = word.get("capturedAt") if hasattr(word, "get") else None
    if captured_at:
        entry["capturedAt"] = str(captured_at)

    return entry


def decode_payload(body: str) -> dict:
    """只给测试与排障用：把 JSON body 解回 dict。"""
    return json.loads(body)
