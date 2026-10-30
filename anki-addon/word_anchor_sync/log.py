"""异常与事件出口：写进 `user_files/error.log`，只保留尾部 20KB。

复习时任何异常都不能弹窗打断节奏，所以这里自己吞掉所有失败。
推送失败（连不上、超时、400）也会在这里留一行，方便排障。
"""

from __future__ import annotations

import traceback
from datetime import datetime
from pathlib import Path

MAX_BYTES = 20 * 1024


def log_path() -> Path:
    return Path(__file__).resolve().parent / "user_files" / "error.log"


def _append(entry: str) -> None:
    try:
        path = log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        previous = path.read_text("utf-8", errors="replace") if path.exists() else ""
        path.write_text((previous + entry)[-MAX_BYTES:], "utf-8")
    except Exception:
        pass


def log_error(context: str = "") -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _append("[{}] {}\n{}\n".format(stamp, context, traceback.format_exc()))


def log_note(context: str = "", detail: str = "") -> None:
    """一行普通记录：推送失败这类「不该弹窗、但想知道为什么」的事。"""
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _append("[{}] {}\n{}\n".format(stamp, context, detail.rstrip()))
