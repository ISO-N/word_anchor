"""从 Anki 笔记里抽出「单词 / 释义」。

只做文本处理，不 import aqt —— 卡片对象是鸭子类型传进来的，
这样 `tests/test_wire.py` 可以直接测字段映射与清洗。
"""

from __future__ import annotations

import html
import re

try:  # Anki 里是包内相对导入；单测把包目录放进 sys.path 后按顶层模块导入
    from . import wire
except ImportError:  # pragma: no cover - 只有脱离 Anki 的单测会走到这里
    import wire

# 块级结束标签换成换行，其余标签直接去掉（<b>foo</b> 不该变成 "foo "）
BREAK_TAGS = re.compile(r"<\s*(?:br|/p|/div|/li|/tr|/h[1-6])\s*/?\s*>", re.I)
ANY_TAG = re.compile(r"<[^>]*>")
SOUND_TAG = re.compile(r"\[(?:sound|anki:play):[^\]]*\]", re.I)
INLINE_SPACE = re.compile(r"[ \t\u00a0]+")
MANY_NEWLINES = re.compile(r"\n{3,}")


def strip_html(value: str) -> str:
    """HTML → 纯文本。保留换行（多义项常见），去掉声音标记与多余空行。"""
    text = BREAK_TAGS.sub("\n", value or "")
    text = ANY_TAG.sub("", text)
    text = SOUND_TAG.sub("", text)
    text = html.unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = INLINE_SPACE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = MANY_NEWLINES.sub("\n\n", text)

    return text.strip()


def clean_term(value: str) -> str:
    # 单词永远压成单行，练习卡的排版才不会被撑破
    single_line = strip_html(value).replace("\n", " ")

    return wire.truncate(single_line.strip(), wire.MAX_TERM_LENGTH)


def clean_meaning(value: str) -> str:
    return wire.truncate(strip_html(value).strip(), wire.MAX_MEANING_LENGTH)


def pick_fields(names, term_field: str, meaning_field: str):
    """配置里的字段名优先；留空或已不存在时退回笔记类型的前两个字段。"""
    if not names:
        return "", ""

    def resolve(configured: str, index: int) -> str:
        if configured and configured in names:
            return configured
        return names[index] if index < len(names) else names[0]

    term_name = resolve(term_field, 0)
    meaning_name = resolve(meaning_field, 1)

    if meaning_name == term_name:
        meaning_name = next((name for name in names if name != term_name), "")

    return term_name, meaning_name


def entry_from_card(card, term_field: str = "", meaning_field: str = ""):
    """返回 `{"term", "meaning", "noteId"}`；读不出完整内容时返回 None。"""
    note = card.note()
    names = list(note.keys())
    term_name, meaning_name = pick_fields(names, term_field, meaning_field)
    if not term_name or not meaning_name:
        return None

    term = clean_term(note[term_name])
    meaning = clean_meaning(note[meaning_name])
    if not term or not meaning:
        return None

    return {"term": term, "meaning": meaning, "noteId": int(card.nid)}
