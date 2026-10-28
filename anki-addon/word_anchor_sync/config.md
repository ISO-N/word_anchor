# 词锚同步配置

推荐直接用 **Tools → 词锚 Word Anchor → 设置…** 改，那里会列出当前词库的字段名。
想手工改配置的话，这里的每一项含义如下。

- `site_url`：词锚部署地址，例如 `https://someone.github.io/word_anchor/`。
  留空时「打开词锚收录」会先提示你填。
- `term_field`：单词所在的字段名。留空 = 自动取笔记类型的第 1 个字段。
- `meaning_field`：释义所在的字段名。留空 = 自动取第 2 个字段。
- `max_deep_link_chars`：深链整条 URL 的字符上限。超过就自动降级成剪贴板通道。
- `capture_enabled`：设为 `false` 可以临时关掉「按重来就收录」。

队列文件在插件目录的 `user_files/queue.json`，报错日志在同目录的 `error.log`。
