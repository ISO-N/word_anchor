"""菜单、设置对话框、预览对话框，以及两条发送通道。

界面部分全部在 Anki 主线程上跑：这些都是用户主动点的动作，不需要后台任务。
"""

from __future__ import annotations

from aqt import mw
from aqt.qt import (
    QAction,
    QApplication,
    QComboBox,
    QDesktopServices,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QMenu,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QUrl,
    QVBoxLayout,
)
from aqt.utils import showInfo, showWarning, tooltip

from . import capture, config, log, queue_store, wire

MENU_TITLE = "词锚 Word Anchor"
MENU_OBJECT = "word_anchor_menu"


# ---------------------------------------------------------------- 菜单


def setup_menu() -> None:
    if mw is None:
        return

    try:
        existing = mw.form.menuTools.findChild(QMenu, MENU_OBJECT)
        if existing is not None:
            existing.deleteLater()

        menu = QMenu(MENU_TITLE, mw)
        menu.setObjectName(MENU_OBJECT)

        send_action = QAction(menu)
        send_action.triggered.connect(send_via_link)
        copy_action = QAction(menu)
        copy_action.triggered.connect(send_via_clipboard)
        preview_action = QAction(menu)
        preview_action.triggered.connect(open_preview)
        test_action = QAction("测试：预览当前卡片", menu)
        test_action.triggered.connect(preview_current_card)
        settings_action = QAction("设置…", menu)
        settings_action.triggered.connect(open_settings)

        menu.addAction(send_action)
        menu.addAction(copy_action)
        menu.addAction(preview_action)
        menu.addSeparator()
        menu.addAction(test_action)
        menu.addAction(settings_action)

        def refresh() -> None:
            data = queue_store.load()
            waiting = len(queue_store.pending(data))
            send_action.setText("打开词锚收录（{} 个待发送）".format(waiting))
            copy_action.setText("复制到剪贴板（{} 个待发送）".format(waiting))
            preview_action.setText("预览队列（共 {} 个）".format(len(data["items"])))
            send_action.setEnabled(waiting > 0)
            copy_action.setEnabled(waiting > 0)

        menu.aboutToShow.connect(refresh)
        refresh()
        mw.form.menuTools.addMenu(menu)
    except Exception:
        log.log_error("创建菜单失败")


# ---------------------------------------------------------------- 发送


def _entries(items, conf: dict) -> list:
    """队列里的原始文本 → 真正要发送的 term / meaning（顺手洗掉字段自带的标签）。"""
    term_field = str(conf.get("term_field", ""))
    meaning_field = str(conf.get("meaning_field", ""))
    term_prefixes = conf.get("strip_term_prefixes") or capture.DEFAULT_TERM_PREFIXES
    meaning_prefixes = (
        conf.get("strip_meaning_prefixes") or capture.DEFAULT_MEANING_PREFIXES
    )

    return [
        capture.clean_entry(
            item["term"],
            item.get("meaning", ""),
            term_field,
            meaning_field,
            term_prefixes,
            meaning_prefixes,
        )
        for item in items
    ]


def _write_clipboard(entries, raw_terms) -> None:
    QApplication.clipboard().setText(wire.clipboard_envelope(entries))
    # 用队列里的原始 term 标记已发送：清洗可能改写过 term（如「单词：lucid」）
    queue_store.mark_sent(raw_terms)


def send_via_clipboard() -> None:
    items = queue_store.pending()
    if not items:
        showInfo("队列里没有待发送的单词。")
        return

    try:
        _write_clipboard(_entries(items, config.load()), [item["term"] for item in items])
    except Exception:
        log.log_error("复制到剪贴板失败")
        showWarning("复制到剪贴板失败，详情见插件的 error.log。")
        return

    tooltip("已复制 {} 个单词到剪贴板".format(len(items)), period=2000)


def send_via_link() -> None:
    conf = config.load()
    if not conf.get("site_url"):
        showWarning(
            "还没有填词锚站点地址。\n\n先在这里填一次：Tools → 词锚 Word Anchor → 设置。"
        )
        open_settings()
        return

    items = queue_store.pending()
    if not items:
        showInfo("队列里没有待发送的单词。")
        return

    raw_terms = [item["term"] for item in items]
    entries = _entries(items, conf)
    try:
        link = wire.deep_link(str(conf["site_url"]), entries)
    except Exception:
        log.log_error("构造收录链接失败")
        showWarning("构造收录链接失败，详情见插件的 error.log。")
        return

    limit = int(conf.get("max_deep_link_chars") or 0) or wire.MAX_PAYLOAD_CHARS
    if len(link) > limit:
        try:
            _write_clipboard(entries, raw_terms)
        except Exception:
            log.log_error("链接过长，降级到剪贴板时失败")
            showWarning("链接太长，复制到剪贴板也失败了。")
            return

        showInfo(
            "这批单词太多，链接放不下，已经复制到剪贴板。\n\n"
            "打开词锚的「单词库」页，粘到「从 Anki 快速收录」里即可。"
        )
        return

    if not QDesktopServices.openUrl(QUrl(link)):
        showWarning(
            "没能打开浏览器。\n\n可以改用「复制到剪贴板」这一条通道。"
        )
        return

    queue_store.mark_sent(raw_terms)
    tooltip("已把 {} 个单词发到词锚".format(len(entries)), period=2000)


# ---------------------------------------------------------------- 预览


class PreviewDialog(QDialog):
    def __init__(self, parent=None, conf=None) -> None:
        super().__init__(parent)
        self.conf = conf if conf is not None else config.load()
        self.setWindowTitle("词锚 · 待收录队列")
        self.resize(680, 480)

        layout = QVBoxLayout(self)
        self.text = QPlainTextEdit(self)
        self.text.setReadOnly(True)
        layout.addWidget(self.text, 1)

        buttons = QDialogButtonBox(self)
        clear_button = QPushButton("清空队列", self)
        resend_button = QPushButton("重新发送全部", self)
        close_button = QPushButton("关闭", self)
        buttons.addButton(clear_button, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(resend_button, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(close_button, QDialogButtonBox.ButtonRole.RejectRole)
        layout.addWidget(buttons)

        clear_button.clicked.connect(self._clear)
        resend_button.clicked.connect(self._resend)
        close_button.clicked.connect(self.reject)

        self.refresh()

    def refresh(self) -> None:
        items = queue_store.load()["items"]
        if not items:
            self.text.setPlainText(
                "队列是空的。\n\n在 Anki 复习时按「重来」，单词就会出现在这里。"
            )
            return

        entries = _entries(items, self.conf)

        lines = []
        for index, (item, entry) in enumerate(zip(items, entries), 1):
            state = "已发送" if item.get("sentAt") else "待发送"
            meaning = entry["meaning"].replace("\n", " / ")
            lines.append("{:02d}. [{}] {}".format(index, state, entry["term"]))
            lines.append("    {}".format(meaning))
            lines.append("    抓取于 {}".format(item.get("capturedAt", "")))
            lines.append("")

        self.text.setPlainText("\n".join(lines))

    def _clear(self) -> None:
        answer = QMessageBox.question(
            self,
            "清空队列？",
            "还没发送的单词也会一起消失，确定吗？",
        )
        if answer == QMessageBox.StandardButton.Yes:
            queue_store.clear()
            self.refresh()

    def _resend(self) -> None:
        data = queue_store.load()
        for item in data["items"]:
            item["sentAt"] = None
        queue_store.save(data)
        self.accept()
        send_via_link()


def open_preview() -> None:
    dialog = PreviewDialog(mw, config.load())
    dialog.exec()


# ---------------------------------------------------------------- 设置


def _field_names() -> list:
    names: list = []
    if mw is None or mw.col is None:
        return names

    try:
        for model in mw.col.models.all():
            for field in model["flds"]:
                name = field["name"]
                if name not in names:
                    names.append(name)
    except Exception:
        log.log_error("读取笔记字段失败")

    return names


def _build_combo(names, current: str) -> QComboBox:
    combo = QComboBox()
    combo.addItem("")
    for name in names:
        combo.addItem(name)
    if current and current not in names:
        combo.addItem(current)
    combo.setCurrentText(current or "")

    return combo


class SettingsDialog(QDialog):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        conf = config.load()
        self.setWindowTitle("词锚 Word Anchor · 设置")
        self.setMinimumWidth(520)

        layout = QVBoxLayout(self)
        form = QFormLayout()

        self.url_edit = QLineEdit(str(conf.get("site_url", "")), self)
        self.url_edit.setPlaceholderText(
            "https://<用户名>.github.io/word_anchor/"
        )
        form.addRow("词锚站点地址", self.url_edit)

        names = _field_names()
        self.term_combo = _build_combo(names, str(conf.get("term_field", "")))
        self.meaning_combo = _build_combo(names, str(conf.get("meaning_field", "")))
        form.addRow("单词字段", self.term_combo)
        form.addRow("释义字段", self.meaning_combo)

        layout.addLayout(form)

        hint = QLabel(
            "字段留空表示自动取笔记类型的第 1、2 个字段。"
            "不确定选哪个时，先用菜单里的「测试：预览当前卡片」看一眼。\n"
            "释义开头带「释义：」这类标签时会自动去掉（可在配置里改）。",
            self,
        )
        hint.setWordWrap(True)
        layout.addWidget(hint)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok
            | QDialogButtonBox.StandardButton.Cancel,
            self,
        )
        buttons.accepted.connect(self._save)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _save(self) -> None:
        url = wire.normalize_site_url(self.url_edit.text())
        if not url:
            showWarning("请填写词锚的站点地址。")
            return

        term = self.term_combo.currentText()
        meaning = self.meaning_combo.currentText()
        if term and meaning and term == meaning:
            showWarning("单词和释义不能是同一个字段。")
            return

        conf = config.load()
        conf.update({"site_url": url, "term_field": term, "meaning_field": meaning})
        config.save(conf)
        self.accept()
        tooltip("词锚设置已保存", period=2000)


def open_settings() -> None:
    dialog = SettingsDialog(mw)
    dialog.exec()


# ---------------------------------------------------------------- 自检


def preview_current_card() -> None:
    reviewer = getattr(mw, "reviewer", None)
    card = getattr(reviewer, "card", None)
    if card is None:
        showInfo("请先进入复习界面，再试一次。")
        return

    conf = config.load()
    try:
        entry = capture.entry_from_card(
            card,
            str(conf.get("term_field", "")),
            str(conf.get("meaning_field", "")),
        )
    except Exception:
        log.log_error("预览当前卡片失败")
        entry = None

    if entry is None:
        showWarning(
            "这张卡读不出单词与释义。\n\n"
            "检查一下字段映射，或者确认这个笔记类型的前两个字段不是空的。"
        )
        return

    showInfo(
        "单词：{}\n\n释义：{}".format(entry["term"], entry["meaning"]),
        title="词锚 · 当前卡片",
    )
