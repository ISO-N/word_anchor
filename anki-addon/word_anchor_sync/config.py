"""插件配置。`config.json` 只是默认值，用户改过的部分由 Anki 保存。"""

from __future__ import annotations

from aqt import mw

PACKAGE = __package__ or __name__

DEFAULTS = {
    "site_url": "",
    "term_field": "",
    "meaning_field": "",
    "max_deep_link_chars": 1600,
    "capture_enabled": True,
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
