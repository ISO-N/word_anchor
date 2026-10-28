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

# 字段内容常常自带标签，这些标签不是释义本身，进词库前要去掉：
#
#     释义：意外发现美好事物的运气
#     单词：lucid
#     【释义】清晰易懂的
#     Meaning:
#     清晰易懂的
#
# 两组默认值可以在插件配置里改（strip_term_prefixes / strip_meaning_prefixes），
# 选中的字段名会自动加入名单。
DEFAULT_TERM_PREFIXES = ("单词", "生词", "Word", "Term")
DEFAULT_MEANING_PREFIXES = (
    "释义",
    "中文释义",
    "英文释义",
    "词义",
    "意思",
    "含义",
    "Meaning",
    "Definition",
    "Translation",
)

LABEL_SEPARATORS = "：:—–－-· \t\n"
BRACKET_PAIRS = (
    ("【", "】"),
    ("[", "]"),
    ("［", "］"),
    ("「", "」"),
    ("(", ")"),
    ("（", "）"),
)


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


def label_list(field_name: str, prefixes) -> list:
    """字段名 + 配置的前缀，长的排在前面（「中文释义」要先于「释义」匹配）。"""
    labels = set()

    if field_name:
        labels.add(field_name.strip())
    for prefix in prefixes or ():
        if isinstance(prefix, str) and prefix.strip():
            labels.add(prefix.strip())

    labels.discard("")

    return sorted(labels, key=len, reverse=True)


def strip_label_prefix(value: str, labels) -> str:
    """去掉开头的 `释义：` / `Meaning:` / `【释义】` / `单词\\n` 这类标签。

    只认两种情况，避免误伤正文：
      1. 标签被 【】/[]/（） 包住，且括号后面还有内容
      2. 标签后面紧跟分隔符（冒号、破折号、空白、换行），且分隔符后面还有内容
    """
    text = value.lstrip()
    if not text:
        return value

    folded = text.casefold()

    for label in labels:
        key = label.casefold()

        for opener, closer in BRACKET_PAIRS:
            boxed = opener + key + closer
            if folded.startswith(boxed):
                rest = text[len(boxed) :].lstrip(LABEL_SEPARATORS)
                if rest:
                    return rest

        if folded.startswith(key):
            tail = text[len(label) :]
            if tail and tail[0] in LABEL_SEPARATORS:
                rest = tail.lstrip(LABEL_SEPARATORS)
                if rest:
                    return rest

    return value


def clean_term(value: str, labels=()) -> str:
    # 单词永远压成单行，练习卡的排版才不会被撑破
    text = strip_html(value).replace("\n", " ").strip()
    text = strip_label_prefix(text, labels).strip()

    return wire.truncate(text, wire.MAX_TERM_LENGTH)


def clean_meaning(value: str, labels=()) -> str:
    text = strip_html(value).strip()
    text = strip_label_prefix(text, labels).strip()

    return wire.truncate(text, wire.MAX_MEANING_LENGTH)


def clean_entry(
    term_raw: str,
    meaning_raw: str,
    term_name: str = "",
    meaning_name: str = "",
    term_prefixes=(),
    meaning_prefixes=(),
) -> dict:
    """发送前再洗一遍：队列里可能躺着旧版本抓进来的「释义：…」。"""
    return {
        "term": clean_term(term_raw, label_list(term_name, term_prefixes)),
        "meaning": clean_meaning(meaning_raw, label_list(meaning_name, meaning_prefixes)),
    }


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


def entry_from_card(
    card,
    term_field: str = "",
    meaning_field: str = "",
    term_prefixes=DEFAULT_TERM_PREFIXES,
    meaning_prefixes=DEFAULT_MEANING_PREFIXES,
):
    """返回 `{"term", "meaning", "noteId"}`；读不出完整内容时返回 None。"""
    note = card.note()
    names = list(note.keys())
    term_name, meaning_name = pick_fields(names, term_field, meaning_field)
    if not term_name or not meaning_name:
        return None

    term = clean_term(note[term_name], label_list(term_name, term_prefixes))
    meaning = clean_meaning(note[meaning_name], label_list(meaning_name, meaning_prefixes))
    if not term or not meaning:
        return None

    return {"term": term, "meaning": meaning, "noteId": int(card.nid)}
