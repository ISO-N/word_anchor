"""待收录队列：`user_files/queue.json`。

- 按单词（忽略大小写）去重；重复抓到时更新释义并把 `sentAt` 清空
- 原子写盘（临时文件 + os.replace），Anki 崩在写入中途也不会留下半个 JSON
- 放在 `user_files/` 里，插件升级不会把队列清掉
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

QUEUE_VERSION = 1
MAX_ITEMS = 1000
FILE_NAME = "queue.json"


def queue_path() -> Path:
    return Path(__file__).resolve().parent / "user_files" / FILE_NAME


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load() -> dict:
    path = queue_path()
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return {"version": QUEUE_VERSION, "items": []}

    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        return {"version": QUEUE_VERSION, "items": []}

    items = [
        item
        for item in data["items"]
        if isinstance(item, dict) and isinstance(item.get("term"), str) and item["term"]
    ]

    return {"version": QUEUE_VERSION, "items": items}


def save(data: dict) -> None:
    path = queue_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(
        dir=str(path.parent), prefix=".queue-", suffix=".json"
    )

    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            json.dump(
                {"version": QUEUE_VERSION, "items": data["items"]},
                file,
                ensure_ascii=False,
                indent=2,
            )
        os.replace(temp, path)
    except BaseException:
        try:
            os.unlink(temp)
        except OSError:
            pass
        raise


def add(term: str, meaning: str, note_id=None) -> None:
    data = load()
    items = data["items"]
    key = term.casefold()

    for item in items:
        if str(item.get("term", "")).casefold() == key:
            item["meaning"] = meaning
            item["capturedAt"] = _now()
            item["noteId"] = note_id
            # 又见到这个词：重新算作待发送，宁可按单词去重多送一次，也不悄悄丢词
            item["sentAt"] = None
            save(data)
            return

    items.append(
        {
            "term": term,
            "meaning": meaning,
            "capturedAt": _now(),
            "noteId": note_id,
            "sentAt": None,
        }
    )
    _trim(items)
    save(data)


def _trim(items) -> None:
    while len(items) > MAX_ITEMS:
        sent = next(
            (index for index, item in enumerate(items) if item.get("sentAt")), None
        )
        del items[sent if sent is not None else 0]


def pending(data: dict | None = None) -> list:
    data = data if data is not None else load()

    return [item for item in data["items"] if not item.get("sentAt")]


def mark_sent(terms) -> None:
    keys = {str(term).casefold() for term in terms}
    data = load()
    stamp = _now()
    changed = False

    for item in data["items"]:
        if str(item.get("term", "")).casefold() in keys:
            item["sentAt"] = stamp
            changed = True

    if changed:
        save(data)


def clear() -> None:
    save({"items": []})
