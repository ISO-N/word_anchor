"""异常出口：写进 `user_files/error.log`，只保留尾部 20KB。

复习时任何异常都不能弹窗打断节奏，所以这里自己吞掉所有失败。
"""

from __future__ import annotations

import traceback
from datetime import datetime
from pathlib import Path

MAX_BYTES = 20 * 1024


def log_path() -> Path:
    return Path(__file__).resolve().parent / "user_files" / "error.log"


def log_error(context: str = "") -> None:
    try:
        path = log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        previous = path.read_text("utf-8", errors="replace") if path.exists() else ""
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = "[{}] {}\n{}\n".format(stamp, context, traceback.format_exc())
        path.write_text((previous + entry)[-MAX_BYTES:], "utf-8")
    except Exception:
        pass
