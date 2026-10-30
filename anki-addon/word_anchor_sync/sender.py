"""把待发队列推送到词锚的本地 API。

只依赖标准库（urllib）：不 import aqt，可脱离 Anki 单测。
网络动作全部在后台线程里跑（见 `ui.push_async`），这里只负责「发一次、给结果」。

失败策略：连接失败/超时/400 都只返回结果、由调用方写日志；
队列里的条目**不**标记已发送，下次按「重来」、启动延时或菜单手动重试。
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

try:  # Anki 里是包内相对导入；单测把包目录放进 sys.path 后按顶层模块导入
    from . import capture, queue_store, wire
except ImportError:  # pragma: no cover - 只有脱离 Anki 的单测会走到这里
    import capture
    import queue_store
    import wire

DEFAULT_TIMEOUT = 2.0
MIN_TIMEOUT = 0.5
MAX_TIMEOUT = 10.0

CONFIG_DIR = "word-anchor"
PORT_FILE = "port"
PORT_FILE_ENV = "WORD_ANCHOR_PORT_FILE"


@dataclass
class PushResult:
    """一次推送的结果。`status` 只有这几种，界面按它决定提示什么。"""

    #: ok / empty / http_error / network_error
    status: str
    accepted: int = 0
    #: 这一批里真正发出去的原始 term（主线程据此 mark_sent）
    terms: tuple = field(default_factory=tuple)
    error: str = ""
    base_url: str = ""

    @property
    def ok(self) -> bool:
        return self.status == "ok"


class UrllibTransport:
    """默认传输：2 秒超时，不重试（重试交给下一次推送）。"""

    def post(self, url: str, body: str, timeout: float):
        request = urllib.request.Request(
            url,
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def get(self, url: str, timeout: float):
        request = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()


# ---------------------------------------------------------------- 端口发现


def port_file_path() -> Path | None:
    """词锚写的端口文件，与桌面端 `src-tauri/src/port_file.rs` 同一路径。"""
    override = os.environ.get(PORT_FILE_ENV)
    if override:
        return Path(override)

    if sys.platform == "win32":
        base = os.environ.get("APPDATA")
        return Path(base) / CONFIG_DIR / PORT_FILE if base else None

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / CONFIG_DIR / PORT_FILE

    xdg = os.environ.get("XDG_CONFIG_HOME")
    base = Path(xdg) if xdg else Path.home() / ".config"
    return base / CONFIG_DIR / PORT_FILE


def discover_port() -> int | None:
    path = port_file_path()
    if path is None:
        return None

    try:
        port = int(path.read_text("utf-8").strip())
    except (OSError, ValueError):
        return None

    return port if wire.PORT_MIN <= port <= wire.PORT_MAX else None


def resolve_base_url(conf: dict) -> str:
    """配置里的 api_base 优先；留空就读端口文件；再不行用默认 8770。"""
    explicit = wire.normalize_api_url(str(conf.get("api_base") or ""))
    if explicit:
        return explicit

    return "http://127.0.0.1:{}".format(discover_port() or wire.DEFAULT_PORT)


def push_timeout(conf: dict) -> float:
    try:
        timeout = float(conf.get("push_timeout", DEFAULT_TIMEOUT))
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT

    return min(max(timeout, MIN_TIMEOUT), MAX_TIMEOUT)


# ---------------------------------------------------------------- 组包


def entries_for(items, conf: dict) -> list:
    """队列里的原始文本 → 真正要发送的 term / meaning（顺手洗掉字段自带的标签）。

    `capturedAt` 原样带走：词锚靠它区分「重新发送全部」（时间没变，只去重）
    与「又按了一次重来」（时间更新，把词挪到队尾重练）。
    """
    term_field = str(conf.get("term_field", ""))
    meaning_field = str(conf.get("meaning_field", ""))
    term_prefixes = conf.get("strip_term_prefixes") or capture.DEFAULT_TERM_PREFIXES
    meaning_prefixes = (
        conf.get("strip_meaning_prefixes") or capture.DEFAULT_MEANING_PREFIXES
    )

    entries = []
    for item in items:
        entry = capture.clean_entry(
            item.get("term", ""),
            item.get("meaning", ""),
            term_field,
            meaning_field,
            term_prefixes,
            meaning_prefixes,
        )
        if item.get("capturedAt"):
            entry["capturedAt"] = str(item["capturedAt"])
        entries.append(entry)

    return entries


# ---------------------------------------------------------------- 推送


def _error_message(payload: bytes, status: int) -> str:
    try:
        data = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return "HTTP {}".format(status)

    if isinstance(data, dict) and isinstance(data.get("error"), str):
        return data["error"]

    return "HTTP {}".format(status)


def post_intake(
    base_url: str,
    body: str,
    timeout: float = DEFAULT_TIMEOUT,
    transport=None,
) -> PushResult:
    sender = transport or UrllibTransport()
    url = base_url.rstrip("/") + wire.ENDPOINT_INTAKE

    try:
        status, payload = sender.post(url, body, timeout)
    except Exception as error:  # 连接被拒、超时、DNS……都算「这次没送到」
        return PushResult(status="network_error", error=str(error), base_url=base_url)

    if status != 200:
        return PushResult(
            status="http_error",
            error=_error_message(payload, status),
            base_url=base_url,
        )

    accepted = 0
    try:
        data = json.loads(payload.decode("utf-8"))
        if isinstance(data, dict):
            accepted = int(data.get("accepted") or 0)
    except (ValueError, TypeError, UnicodeDecodeError):
        accepted = 0

    return PushResult(status="ok", accepted=accepted, base_url=base_url)


def push_pending(conf: dict, transport=None) -> PushResult:
    """把队列里所有待发送的条目推一次（最多 200 条，剩下的留到下次）。"""
    items = queue_store.pending()
    if not items:
        return PushResult(status="empty")

    batch = items[: wire.MAX_ENTRIES]
    body = wire.encode_payload(entries_for(batch, conf))
    base_url = resolve_base_url(conf)

    if len(body.encode("utf-8")) > wire.MAX_BODY_BYTES:
        return PushResult(
            status="http_error",
            error="这一批内容超过 512KB，先在预览队列里清掉一部分",
            base_url=base_url,
        )

    result = post_intake(base_url, body, push_timeout(conf), transport)
    result.terms = tuple(str(item.get("term", "")) for item in batch)
    return result


def check_health(
    base_url: str,
    timeout: float = DEFAULT_TIMEOUT,
    transport=None,
) -> tuple:
    """设置页的「测试连接」：→ (是否连通, 可读说明)。"""
    sender = transport or UrllibTransport()
    url = base_url.rstrip("/") + wire.ENDPOINT_HEALTH

    try:
        status, payload = sender.get(url, timeout)
    except Exception as error:
        return False, str(error)

    if status != 200:
        return False, "HTTP {}".format(status)

    try:
        data = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return False, "返回内容不是 JSON"

    if isinstance(data, dict) and data.get("ok") is True:
        return True, "127.0.0.1:{}".format(data.get("port", "?"))

    return False, "返回内容不是词锚的 health 响应"
