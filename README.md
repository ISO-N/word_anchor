# 词锚 Word Anchor

一个装在 Windows 桌面上的单词记忆工具：管理词库 → 按 FIFO 自动编排学习清单 → 连线练习配对单词与释义，另有随时可来的「趣味复习」四选一。

Anki 里按「重来」的单词会由插件**自动**推进词锚（本机 HTTP，不经过浏览器、不经过剪贴板、不联网）。词库保存在本机 SQLite 文件里，关掉窗口后应用留在托盘继续接收推送。

> 网页版已退役：仓库不再部署 GitHub Pages，也不再接收 `#inbox=` 深链或剪贴板信封。

## 功能

- **单词管理**：手动添加、编辑、删除和搜索单词及释义，单词去重（忽略大小写）；新增与编辑在页面中央的对话框里完成；50 条一页，搜索词与页码写在 URL 里（`/words/?q=serendipity&page=2`）。每行标出这个词所在的清单（`LIST 02`），点一下直接进入那一组的连线练习。表格最左常驻勾选列，选中项跨页、跨搜索保留，可一键选中全部筛选结果、也能一次删掉多个词。
- **FIFO 清单**：按录入时间先进先出分组，每组 2–20 个单词，修改后清单立即重新编排；清单页 10 份一页，页码同样写在 URL 里。
- **连线练习**：左右两列各自打乱，并保证同一行永远不会出现对应的词与义；支持点击配对或拖拽连线；可选择**即时反馈**或**手动判定**；键盘同样可以完成整轮练习。
- **趣味复习**：`/review` 随机抽一个单词 + 3 个干扰释义，4 选 1、点选即判；答题结果按单词累计，显示在「单词库」的「复习」列，并随备份导出。
- **进度记录**：练完一份清单时按单词记下完成时间；重排或调整每组数量后，练过的组合仍然是「已完成」。
- **Anki 自动收录**：复习按「重来」→ 后台线程推送 → 词锚实时入库、横幅报数；离线时静默留队，下次按「重来」、启动后延时、或菜单「立即推送」再试。
- **桌面端**：托盘常驻（关窗只是隐藏）、单实例、可选开机自启、系统对话框导入导出备份。
- **主题**：跟随系统 / 浅色 / 深色三态切换，偏好存在 `localStorage`，首帧即生效。

## 安装（Windows）

1. 到 [Releases](../../releases) 下载 `Word Anchor_<版本>_x64-setup.exe`（NSIS，按当前用户安装，不需要管理员）。
2. 双击安装并启动；首次启动会创建 `%APPDATA%\top.kariscode.wa\` 目录。
3. 词库是空的——先到「单词库」加第一个词，或从旧网页版导入备份（见下）。

安装器会在缺 WebView2 Runtime 时自动下载安装（`downloadBootstrapper`）；Windows 10 1803+ 一般已自带。

从源码构建见下方「开发」。

## 开发

```bash
pnpm install
pnpm desktop        # tauri dev：Next dev server + Tauri 窗口（推荐）
pnpm dev            # 只跑 Next（浏览器预览，数据只在内存里，刷新即清空）
```

- `pnpm desktop` 会先起 `localhost:3000`，再由 Tauri 加载；本地 API 在 `127.0.0.1:8770..8789`。
- 浏览器预览**没有** SQLite、也不接收 Anki 推送：适合调样式，不适合验证持久化。
- 改 Rust 代码时 `pnpm desktop` 会自动重编。

打包安装包：

```bash
pnpm desktop:build  # 产物在 src-tauri/target/release/bundle/nsis/
```

## 验证

```bash
pnpm verify       # typecheck → lint → 类名一致性 → vitest → 静态导出
pnpm test:rust    # cargo test（payload 校验矩阵、端口扫描、收件箱原子写）
pnpm test:addon   # Anki 插件的 unittest
pnpm verify:all   # 上面三样一次跑完
pnpm check:unused # 咨询：列出没被引用的类与设计令牌（不阻塞）
```

`pnpm check:css` 是类名守卫（TSX 里用到的类名必须在样式表中存在）。人工回归清单见 [`docs/qa.md`](docs/qa.md)。

## 数据存在哪里

| 内容 | 位置 |
| --- | --- |
| 词库、每组数量、练习与复习统计 | `%APPDATA%\top.kariscode.wa\word-anchor.db`（SQLite） |
| 待收录 payload（Rust → 前端的交接点） | `%APPDATA%\top.kariscode.wa\inbox\` |
| 端口发现文件 | `%APPDATA%\word-anchor\port`（纯文本端口号，退出时删除） |
| 主题偏好 | WebView 的 `localStorage`（键 `word-anchor:theme`） |

- 数据跟着 Windows 用户走：换设备、重装系统、清理 `%APPDATA%` 后都看不到原词库。
- 「单词库」页底部提供 **导出备份 / 导入备份 / 清空数据**，导出走系统「另存为」，文件是纯 JSON（AppDatabase v3），旧网页版导出的备份可以直接导入。
- 删掉 WebView 缓存（`%LOCALAPPDATA%\top.kariscode.wa\`）不会碰 `word-anchor.db`。

## 本地 API

给 Anki 插件用，只绑 `127.0.0.1`，没有 token（v1 的取舍：只写收件箱文件，最坏影响是伪造收录）。

### `POST /api/v1/intake`

```json
{"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的","capturedAt":"2024-05-01T09:00:00.000+00:00"}]}
```

| 结果 | 含义 |
| --- | --- |
| `200 {"accepted":<n>}` | 已原子写入 `inbox/<ts>.json`，并发出 `anki:intake` 事件 |
| `400 {"error":"<原因>"}` | 结构不合法；插件**不**标记已发送，队列保留 |
| `403 {"error":"<原因>"}` | 非本机来源、Host 不认识、或 Origin 不在白名单 |
| `404 {"error":"没有这个接口"}` | 未匹配路由 |
| `500 {"error":"<原因>"}` | 收件箱写入失败（磁盘/权限） |

约束：body ≤ 512KB、≤ 200 条、`term` ≤ 80 字符、`meaning` ≤ 300 字符、`v` 必须为 1、`source` 必须为 `anki`。`capturedAt` 可选。

### `GET /api/v1/health`

```json
{"ok":true,"app":"word-anchor","port":8770}
```

「单词库」页「桌面端」区的「测试连接」就是打这个接口。

### 端口发现

1. 应用启动时从 8770 开始试，被占用就顺延到 8771…8789；
2. 绑定成功后把端口写进 `%APPDATA%\word-anchor\port`（原子写）；
3. 插件读取顺序：配置里的「API 地址」非空 → 直接用；否则读端口文件；再否则用 `http://127.0.0.1:8770`。

## 从 Anki 自动收录

详见 [`anki-addon/README.md`](anki-addon/README.md)。

1. 把 `anki-addon/word_anchor_sync/` 复制到 `addons21/`（或安装打包好的 `.ankiaddon`），重启 Anki。
2. **工具 → 词锚 Word Anchor → 设置…**：确认「API 地址」留空（自动发现）、勾选一个牌组、必要时指定单词/释义字段。
3. 复习时按「重来」即可。词锚开着就秒入库；没开就留在队列里，等下次重试。

同一个词不会重复入库；但如果是 Anki 里**新的一次抓取**（`capturedAt` 比库里记录的新），它会挪到队尾并清掉「练过」标记，让它再练一次。重发同一批（时间戳没变）只去重，不会打乱顺序。

## 从旧网页版迁移

网页版仍在线时：打开旧站点 → **单词库 → 导出备份** → 下载 JSON → 桌面端 **单词库 → 导入备份** → 覆盖导入。词库、每组数量、练习记录、趣味复习统计都会恢复。

确认迁移完成后，仓库里已删除 `.github/workflows/deploy.yml` 与 `NEXT_PUBLIC_BASE_PATH`，不再部署 Pages。

## 结构

```text
src-tauri/                  # Rust 侧：窗口、托盘、本地 API、收件箱
├── tauri.conf.json         # 窗口 1100×760、NSIS、CSP、插件
├── capabilities/default.json
└── src/
    ├── lib.rs              # 单实例、托盘、插件注册、关窗进托盘
    ├── api.rs              # axum：校验 → 写 inbox → emit anki:intake
    ├── inbox.rs            # 原子写 / 列表 / 只删收件箱里的文件
    └── port_file.rs        # <系统配置目录>/word-anchor/port

src/
├── app/                    # 首页 / 清单 / 练习 / 趣味复习 / 单词库
├── components/
│   ├── anki-intake.tsx     # 收件箱消费者：启动补收 + 事件实时收
│   ├── desktop-panel.tsx   # 单词库「桌面端」区：端口、测试连接、自启
│   ├── data-backup.tsx     # 系统对话框导入导出
│   └── ...
└── lib/
    ├── data.ts             # 纯函数：分组、校验、收录、复习统计（零 I/O）
    ├── store.ts            # 内存快照 + 订阅 + 排队落盘
    ├── sqlite.ts           # tauri-plugin-sql、migrations、行 ↔ 快照
    ├── desktop.ts          # Tauri command / 事件 / 对话框 / 自启
    ├── platform.ts         # isTauri 探测
    ├── intake.ts           # wire v1 解析与报数
    ├── backup.ts           # 备份序列化 / 校验 / 下载
    └── ...
```

## 设计说明：为什么收件箱是文件，不是表

Rust 侧（axum）和前端（tauri-plugin-sql）各自持有一条 SQLite 连接。让 Rust 也写 `word-anchor.db` 就意味着两份 schema、两套写顺序，任何一边改动都可能悄悄漂移。

所以 Rust 收到 POST 后只做三件事：**严格校验** → **原子写 `inbox/<ts>.json`** → **发 `anki:intake` 事件**。业务语义（按单词去重、按 `capturedAt` 重排、`rejected` 报数）全部留在前端的 `applyIntake`。同一份 payload 重复投递天然幂等；桌面端没开时，文件就静静躺在磁盘上，下次启动补收。

## 设计说明：整份快照落盘

所有改动仍然先走 `data.ts` 纯函数算出新快照（界面同步响应），再把整份快照写进 `words`：

1. 按 `position` 分批 `INSERT OR REPLACE` 全部行；
2. `DELETE FROM words WHERE position >= <快照长度>` 删掉多出来的旧行；
3. 写 `settings`（`listSize` / `feedbackMode`）与 `meta.schema_version`。

两点取舍写在这里，因为它和「事务里整表重写」的直觉不同：

- **没有事务**：tauri-plugin-sql 的 JS API 只有 `execute` / `select`，连接池也可能把两次调用分到不同连接上。所以顺序刻意是「先写后删」——中途崩溃最多留下几条上一版仍在词库里的词，绝不会让整库消失。
- **多一列 `position`**：`words` 数组的顺序就是 FIFO 队列，重排过的词会带着原来的 `id` 排到末尾。只按 `id` 排序会把队列弄乱，所以要显式落盘数组下标。

词库规模在数千条以内时，整份快照是毫秒级；如果将来过万，只需把写路径改成增量 UPSERT，schema 不用动。

`normalizeDatabase` 仍然是读盘的兜底：磁盘数据被外部工具改过、或来自更旧的版本时，界面拿到的仍是清洗过的可用快照。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 启动后没窗口，只有托盘图标 | 说明用了 `--hidden`（开机自启）。左键托盘图标恢复窗口 |
| 关掉窗口后收不到 Anki 推送 | 关窗只是隐藏到托盘。要接收推送请让托盘图标在；完全退出就不再收 |
| 插件提示连不上 | 词锚是否在运行？看「单词库 → 桌面端」的接口地址；`%APPDATA%\word-anchor\port` 是否存在 |
| 端口 8770 被占用 | 应用会自动顺延并在端口文件里写新端口，插件会自动发现；手填过「API 地址」的请清空 |
| 安全软件拦截本地端口 | 允许 `Word Anchor.exe` 的本地回环监听；或在设置里把「API 地址」指到实际端口 |
| 安装时提示缺 WebView2 | 安装器会自动下载；网络受限时手动安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| 词库空了 | 检查 `%APPDATA%\top.kariscode.wa\word-anchor.db` 是否还在；用最近的 JSON 备份导入 |
| 想彻底重来 | 退出应用 → 重命名/删除 `word-anchor.db` → 重新启动（会建空库） |

## 技术栈

- Tauri 2（Rust + WebView2），`tauri-plugin-sql` / `dialog` / `fs` / `autostart` / `single-instance`
- axum 0.8 + tokio 提供 127.0.0.1 本地 API
- Next.js 16（App Router，`output: "export"` 静态导出）+ React 19 + TypeScript
- SQLite（整份快照落盘，读盘过 `normalizeDatabase`）
- 原生 CSS：`@layer` 分层 + CSS Modules，无 CSS 框架
- Crimson Pro（OFL，latin 子集，经 `next/font/local` 自托管）

## 非目标（本期不做）

自动更新（updater）、macOS/Linux 打包验证、API 鉴权、多设备同步、旧 base64url payload 兼容。
