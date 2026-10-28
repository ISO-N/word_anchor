#!/usr/bin/env python3
"""把插件目录打包成 `dist/word-anchor-sync.ankiaddon`。

`.ankiaddon` 里不能带顶层目录，所以 zip 里的路径都相对 `word_anchor_sync/`。
运行时产生的 `user_files/` 与 `__pycache__/` 不进包。
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "word_anchor_sync"
TARGET = ROOT / "dist" / "word-anchor-sync.ankiaddon"
EXCLUDED_DIRS = {"__pycache__", "user_files"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo"}
REQUIRED = {"__init__.py", "manifest.json", "config.json"}


def main() -> int:
    if not SOURCE.is_dir():
        print("找不到插件目录：{}".format(SOURCE))
        return 1

    missing = [name for name in REQUIRED if not (SOURCE / name).exists()]
    if missing:
        print("插件目录缺少文件：" + "、".join(sorted(missing)))
        return 1

    TARGET.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(TARGET, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(SOURCE.rglob("*")):
            if path.is_dir():
                continue

            relative = path.relative_to(SOURCE)
            if set(relative.parts) & EXCLUDED_DIRS:
                continue
            if path.suffix in EXCLUDED_SUFFIXES:
                continue

            archive.write(path, relative.as_posix())

    print("已生成 {}".format(TARGET))
    return 0


if __name__ == "__main__":
    sys.exit(main())
