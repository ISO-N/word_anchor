"""词锚同步 · 复习时按「重来」，把单词和释义攒进队列。

1. 复习中按「重来」（ease = 1）→ 抓取笔记里的单词与释义 → 追加进 user_files/queue.json
2. Tools → 词锚 Word Anchor →「打开词锚收录」或「复制到剪贴板」
3. 词锚页面把这一批词写进浏览器本地词库

词锚是纯静态站点，词库只存在访问者自己的浏览器里，
所以插件只负责把词送到浏览器门口，不往任何服务器写东西。
"""

from __future__ import annotations

from aqt import gui_hooks
from aqt.qt import QTimer
from aqt.utils import tooltip

from . import capture, config, log, queue_store, ui

_hinted_missing_site = False


def _on_answer(reviewer, card, ease) -> None:
    """复习界面点下任何评分按钮后触发；只有「重来」才收录。"""
    global _hinted_missing_site

    try:
        if int(ease) != 1:
            return

        conf = config.load()
        if not conf.get("capture_enabled", True):
            return

        entry = capture.entry_from_card(
            card,
            str(conf.get("term_field", "")),
            str(conf.get("meaning_field", "")),
        )
        if entry is None:
            return

        queue_store.add(entry["term"], entry["meaning"], entry["noteId"])

        if not _hinted_missing_site and not conf.get("site_url"):
            _hinted_missing_site = True
            tooltip(
                "词锚：单词已收进队列，记得在 Tools → 词锚 里填站点地址",
                period=3000,
            )
    except Exception:
        # 复习节奏优先：任何问题只写日志，不弹窗
        log.log_error("按下「重来」时抓取失败")


gui_hooks.reviewer_did_answer_card.append(_on_answer)
QTimer.singleShot(0, ui.setup_menu)
