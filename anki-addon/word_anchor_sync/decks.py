"""牌组：卡片属于哪个牌组、词库里有哪些牌组。

这里只碰 Anki 对象（`mw.col.decks`），不做名字匹配 ——
`capture.deck_allowed()` 那边是纯字符串逻辑，单测覆盖得到。
"""

from __future__ import annotations

from aqt import mw

from . import log


def name(card) -> str:
    """卡片所在牌组名；读不出来时返回空串（白名单非空时会被挡下）。"""
    try:
        did = int(card.did)
    except (AttributeError, TypeError, ValueError):
        return ""

    if mw is None or mw.col is None:
        return ""

    try:
        return mw.col.decks.name(did) or ""
    except Exception:
        # 牌组可能刚被删掉；白名单非空时读不到名字就当它不该收录
        log.log_error("读取卡片所属牌组失败")
        return ""


def all_names() -> list:
    names: list = []
    if mw is None or mw.col is None:
        return names

    try:
        for deck in mw.col.decks.all():
            deck_name = deck.get("name")
            if deck_name and deck_name not in names:
                names.append(deck_name)
    except Exception:
        log.log_error("读取牌组列表失败")

    return sorted(names)
