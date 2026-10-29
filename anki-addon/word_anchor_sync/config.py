"""插件配置。`config.json` 只是默认值，用户改过的部分由 Anki 保存。"""

from __future__ import annotations

from aqt import mw

PACKAGE = __package__ or __name__

DEFAULTS = {
    "site_url": "",
    "term_field": "",
    "meaning_field": "",
    # 牌组白名单：留空 = 所有牌组都收录（旧版行为）。非空时只收勾中的牌组，
    # 以及它们的子牌组（子牌组可用 deck_whitelist_subdecks 关掉）。
    "deck_whitelist": [],
    "deck_whitelist_subdecks": True,
    "max_deep_link_chars": 1600,
    "capture_enabled": True,
    # 字段内容里自带的标签，入词库前去掉（选中的字段名会自动加入名单）
    "strip_term_prefixes": ["单词", "生词", "Word", "Term"],
    "strip_meaning_prefixes": [
        "释义",
        "中文释义",
        "英文释义",
        "词义",
        "意思",
        "含义",
        "Meaning",
        "Definition",
        "Translation",
    ],
}


def load() -> dict:
    stored = mw.addonManager.getConfig(PACKAGE) or {}
    merged = dict(DEFAULTS)

    if isinstance(stored, dict):
        for key, value in stored.items():
            if value is not None:
                merged[key] = value

    return merged


def save(values: dict) -> None:
    merged = dict(DEFAULTS)
    merged.update(values)
    mw.addonManager.writeConfig(PACKAGE, merged)
