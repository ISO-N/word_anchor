"""词锚同步 · 复习时按「重来」，单词自动推进词锚桌面端。

1. 复习中按「重来」（ease = 1）→ 过牌组白名单 → 抓取笔记里的单词与释义
   → 追加进 `user_files/queue.json`
2. `auto_push` 打开时，后台线程立刻把待发队列 POST 给词锚的本地 API
   （`http://127.0.0.1:8770`，端口被占用时词锚会顺延并写下端口文件）
3. 发送失败不打扰复习：条目留在队列里，等下次按「重来」、Anki 启动延时
   或菜单里的「立即推送」再试

词锚是桌面应用，词库只存在本机 SQLite 里。插件只往 127.0.0.1 送数据，
不联网、不碰剪贴板、不打开浏览器。
"""

from __future__ import annotations

from aqt import gui_hooks
from aqt.qt import QTimer

from . import capture, config, decks, log, queue_store, ui

#: Anki 启动后延时一次补推：上一次可能是开机自启、词锚还没起来
STARTUP_PUSH_DELAY_MS = 5000


def _on_answer(reviewer, card, ease) -> None:
    """复习界面点下任何评分按钮后触发；只有「重来」才收录。"""
    try:
        if int(ease) != 1:
            return

        conf = config.load()
        if not conf.get("capture_enabled", True):
            return

        # 白名单为空时这里恒为 True，行为和旧版一致
        if not capture.deck_allowed(
            decks.name(card),
            conf.get("deck_whitelist"),
            bool(conf.get("deck_whitelist_subdecks", True)),
        ):
            return

        entry = capture.entry_from_card(
            card,
            str(conf.get("term_field", "")),
            str(conf.get("meaning_field", "")),
            conf.get("strip_term_prefixes") or capture.DEFAULT_TERM_PREFIXES,
            conf.get("strip_meaning_prefixes") or capture.DEFAULT_MEANING_PREFIXES,
        )
        if entry is None:
            return

        queue_store.add(entry["term"], entry["meaning"], entry["noteId"])

        if conf.get("auto_push", True):
            ui.push_async(silent=True)
    except Exception:
        # 复习节奏优先：任何问题只写日志，不弹窗
        log.log_error("按下「重来」时抓取失败")


def _startup_push() -> None:
    try:
        if config.load().get("auto_push", True):
            ui.push_async(silent=True)
    except Exception:
        log.log_error("启动时补推失败")


gui_hooks.reviewer_did_answer_card.append(_on_answer)
QTimer.singleShot(0, ui.setup_menu)
QTimer.singleShot(STARTUP_PUSH_DELAY_MS, _startup_push)
