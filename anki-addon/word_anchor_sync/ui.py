"""菜单、设置对话框、预览对话框，以及后台推送的编排。

界面部分全部在 Anki 主线程上跑；真正发 HTTP 的后台线程只碰 sender，
回来时用 `mw.taskman.run_on_main` 切回主线程再动队列与 Qt。
"""

from __future__ import annotations

import threading

from aqt import mw
from aqt.qt import (
    QAction,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMenu,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    Qt,
    QVBoxLayout,
    QWidget,
)
from aqt.utils import showInfo, showWarning, tooltip

from . import capture, config, decks, log, queue_store, sender, wire

MENU_TITLE = "词锚 Word Anchor"
MENU_OBJECT = "word_anchor_menu"

_push_lock = threading.Lock()


# ---------------------------------------------------------------- 后台推送


def push_async(silent: bool = True) -> bool:
    """后台推一次。已经在推时返回 False：这一批会跟着下一次一起走。

    `conf` 在主线程读好再交给后台线程 —— addonManager 只在主线程碰。
    """
    conf = config.load()

    if not _push_lock.acquire(blocking=False):
        return False

    def worker() -> None:
        try:
            result = sender.push_pending(conf)
        except Exception:
            log.log_error("后台推送失败")
            _on_main(lambda: _finish_failure(silent))
            return
        finally:
            _push_lock.release()

        _on_main(lambda: _finish(result, silent))

    threading.Thread(target=worker, name="word-anchor-push", daemon=True).start()
    return True


def _on_main(callback) -> None:
    """把回调切回 Anki 主线程；Anki 正在退出时只写日志。"""
    try:
        mw.taskman.run_on_main(callback)
    except Exception:
        log.log_error("切换回主线程失败")


def _finish(result: sender.PushResult, silent: bool) -> None:
    """回到主线程：标记已发送，然后按需要提示。"""
    if result.ok:
        try:
            queue_store.mark_sent(result.terms)
        except Exception:
            log.log_error("标记已发送失败")
    else:
        log.log_note("推送未完成：{}".format(result.status), result.error or "")

    # 推送期间又按了「重来」/ 队列超过 200 条：成功之后再顺一次，失败就停
    if result.ok and queue_store.pending():
        push_async(silent=silent)

    if silent:
        return

    if result.ok:
        tooltip("已推送 {} 个单词".format(result.accepted), period=2000)
    elif result.status == "empty":
        showInfo("队列里没有待发送的单词。")
    else:
        showWarning(
            "没能推送到词锚：{}\n\n队列里还有 {} 个待发送，下次按「重来」或手动推送时会重试。".format(
                result.error or result.status, len(queue_store.pending())
            )
        )


def _finish_failure(silent: bool) -> None:
    if not silent:
        showWarning("推送时出错，详情见插件的 error.log。")


def push_now() -> None:
    """菜单里的「立即推送」：用户主动触发，结果用提示框回报。"""
    if not queue_store.pending():
        showInfo("队列里没有待发送的单词。")
        return

    if not push_async(silent=False):
        showInfo("上一批还在推送，稍等一下。")


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
        send_action.triggered.connect(push_now)
        preview_action = QAction(menu)
        preview_action.triggered.connect(open_preview)
        test_action = QAction("测试：预览当前卡片", menu)
        test_action.triggered.connect(preview_current_card)
        settings_action = QAction("设置…", menu)
        settings_action.triggered.connect(open_settings)

        menu.addAction(send_action)
        menu.addAction(preview_action)
        menu.addSeparator()
        menu.addAction(test_action)
        menu.addAction(settings_action)

        def refresh() -> None:
            data = queue_store.load()
            waiting = len(queue_store.pending(data))
            send_action.setText("立即推送（{} 个待发送）".format(waiting))
            preview_action.setText("预览队列（共 {} 个）".format(len(data["items"])))
            send_action.setEnabled(waiting > 0)

        menu.aboutToShow.connect(refresh)
        refresh()
        mw.form.menuTools.addMenu(menu)
    except Exception:
        log.log_error("创建菜单失败")


# ---------------------------------------------------------------- 预览


class PreviewDialog(QDialog):
    def __init__(self, parent=None, conf=None) -> None:
        super().__init__(parent)
        self.conf = conf if conf is not None else config.load()
        self.setWindowTitle("词锚 · 待收录队列")
        self.resize(680, 480)

        layout = QVBoxLayout(self)

        self.address = QLabel(self)
        self.address.setWordWrap(True)
        layout.addWidget(self.address)

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
        self.address.setText(
            "推送地址：{}（留空「API 地址」时会自动发现端口）".format(
                sender.resolve_base_url(self.conf)
            )
        )

        items = queue_store.load()["items"]
        if not items:
            self.text.setPlainText(
                "队列是空的。\n\n在 Anki 复习时按「重来」，单词就会自动出现在词锚里。"
            )
            return

        entries = sender.entries_for(items, self.conf)

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
        self.refresh()
        push_now()


def open_preview() -> None:
    dialog = PreviewDialog(mw, config.load())
    dialog.exec()


# ---------------------------------------------------------------- 设置

# 配置里还留着、但词库里已经没这个名字的牌组，也得列出来，否则用户没法取消勾选
STALE_DECK_SUFFIX = "（已不存在）"


def _deck_rows(names, selected) -> list:
    """→ [(显示名, 真实牌组名, 是否勾选)]，勾选的排前面。"""
    wanted = capture.normalize_whitelist(selected)
    matched = set()
    rows = []

    for name in names:
        checked = name.casefold() in wanted
        if checked:
            matched.add(name.casefold())
        rows.append((name, name, checked))

    for key in wanted:
        if key not in matched:
            rows.append((key + STALE_DECK_SUFFIX, key, True))

    return [row for row in rows if row[2]] + [row for row in rows if not row[2]]


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
        self.setMinimumWidth(560)
        self.resize(600, 660)

        layout = QVBoxLayout(self)
        form = QFormLayout()

        self.api_edit = QLineEdit(str(conf.get("api_base", "")), self)
        self.api_edit.setPlaceholderText(
            "留空 = 自动发现端口（默认 http://127.0.0.1:8770）"
        )
        self.test_button = QPushButton("测试连接", self)
        self.test_button.clicked.connect(self._test_connection)

        api_row = QWidget(self)
        api_layout = QHBoxLayout(api_row)
        api_layout.setContentsMargins(0, 0, 0, 0)
        api_layout.addWidget(self.api_edit, 1)
        api_layout.addWidget(self.test_button)
        form.addRow("词锚 API 地址", api_row)

        self.auto_push = QCheckBox("按「重来」后自动推送（失败静默留队重试）", self)
        self.auto_push.setChecked(bool(conf.get("auto_push", True)))
        form.addRow("", self.auto_push)

        names = _field_names()
        self.term_combo = _build_combo(names, str(conf.get("term_field", "")))
        self.meaning_combo = _build_combo(names, str(conf.get("meaning_field", "")))
        form.addRow("单词字段", self.term_combo)
        form.addRow("释义字段", self.meaning_combo)

        layout.addLayout(form)

        hint = QLabel(
            "词锚桌面端必须正在运行（关掉窗口没关系，它会留在托盘里）。\n"
            "「API 地址」留空时，插件会读词锚写下的端口文件自动找到端口；"
            "端口被占用时词锚会自动顺延，所以一般不需要手填。\n"
            "字段留空表示自动取笔记类型的第 1、2 个字段。"
            "不确定选哪个时，先用菜单里的「测试：预览当前卡片」看一眼。",
            self,
        )
        hint.setWordWrap(True)
        layout.addWidget(hint)

        layout.addWidget(QLabel("牌组白名单", self))
        deck_hint = QLabel(
            "只收录勾选的牌组；一个都不勾 = 所有牌组都收。"
            "勾了父牌组就等于连它的子牌组一起收（「英语」含「英语::单词」）。\n"
            "改动只影响之后按下的「重来」，队列里已经攒着的条目不会自己消失。",
            self,
        )
        deck_hint.setWordWrap(True)
        layout.addWidget(deck_hint)

        self.deck_list = QListWidget(self)
        self.deck_list.setMinimumHeight(150)
        self.deck_list.setToolTip("点方框勾选；没勾的牌组按「重来」时不会被收录")
        for display, deck_name, checked in _deck_rows(
            decks.all_names(), conf.get("deck_whitelist")
        ):
            item = QListWidgetItem(display, self.deck_list)
            item.setData(Qt.ItemDataRole.UserRole, deck_name)
            item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            item.setCheckState(
                Qt.CheckState.Checked if checked else Qt.CheckState.Unchecked
            )
        layout.addWidget(self.deck_list, 1)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok
            | QDialogButtonBox.StandardButton.Cancel,
            self,
        )
        buttons.accepted.connect(self._save)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _test_connection(self) -> None:
        conf = config.load()
        conf["api_base"] = self.api_edit.text()
        base = sender.resolve_base_url(conf)
        ok, detail = sender.check_health(base)

        if ok:
            showInfo(
                "连接正常：词锚在 {} 应答。".format(detail),
                title="词锚 · 测试连接",
            )
        else:
            showWarning(
                "连不上词锚（{}）：{}\n\n先确认词锚桌面端正在运行。".format(base, detail),
                title="词锚 · 测试连接",
            )

    def _save(self) -> None:
        term = self.term_combo.currentText()
        meaning = self.meaning_combo.currentText()
        if term and meaning and term == meaning:
            showWarning("单词和释义不能是同一个字段。")
            return

        conf = config.load()
        conf.update(
            {
                "api_base": wire.normalize_api_url(self.api_edit.text()),
                "auto_push": self.auto_push.isChecked(),
                "term_field": term,
                "meaning_field": meaning,
                "deck_whitelist": self._checked_decks(),
            }
        )
        config.save(conf)
        self.accept()
        tooltip("词锚设置已保存", period=2000)

    def _checked_decks(self) -> list:
        names = []
        for row in range(self.deck_list.count()):
            item = self.deck_list.item(row)
            if item.checkState() != Qt.CheckState.Checked:
                continue
            deck_name = item.data(Qt.ItemDataRole.UserRole)
            if deck_name:
                names.append(str(deck_name))

        return names


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
    deck = decks.name(card)
    if not capture.deck_allowed(
        deck,
        conf.get("deck_whitelist"),
        bool(conf.get("deck_whitelist_subdecks", True)),
    ):
        showWarning(
            "这张卡所在的牌组不在白名单里，按「重来」不会收录。\n\n"
            "牌组：{}\n\n"
            "要收录它就打开 设置… 把这个牌组勾上。".format(deck or "（读不出来）")
        )
        return

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
