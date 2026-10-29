# 词锚 Word Anchor

一个使用 Next.js 构建的单词记忆工具。核心流程是：管理词库 → 按 FIFO 自动编排学习清单 → 通过连线练习配对单词与释义。

整套应用是纯静态站点：构建产物可以直接托管在 GitHub Pages，词库和练习记录保存在**每个访问者自己的浏览器**里，不经过任何服务器。

## 功能

- **单词管理**：手动添加、编辑、删除和搜索单词及释义，单词去重（忽略大小写）；新增与编辑在页面中央的对话框里完成，改完不会把你从当前滚动位置带走；50 条一页，搜索词与页码写在 URL 里（`/words/?q=serendipity&page=2`），可分享、可后退。每行还标出这个词所在的清单（`LIST 02`），点一下直接进入那一组的连线练习——编号按全库先进先出顺序计算，与搜索、分页无关。表格最左常驻勾选列，选中项跨页、跨搜索保留，可一键选中全部筛选结果，也能在确认对话框里一次删掉多个词（会先列出将删除的词）；删除后清单立即重新编排。
- **FIFO 清单**：按录入时间先进先出分组，可设置每组 2–20 个单词，修改后清单立即重新编排；清单页 10 份一页，页码同样写在 URL 里（`/lists/?page=2`），页脚会提示「下一组在第 N 页」。已经收录过的词在 Anki 里再按一次「重来」，会被挪到队尾重新排队，于是它在最新一组里再出现一次。
- **连线练习**：左右两列各自打乱，并保证同一行永远不会出现对应的词与义（错排约束）；支持点击配对或拖拽连线；可选择**即时反馈**（连上即用墨绿／陶土虚线标出对错，全部连对自动完成）或**手动判定**（连线时不露对错，全部连好后点「判定」一次看清结果，错误连线保留可改）。键盘同样可以完成整轮练习。
- **进度记录**：练完一份清单时按单词记下完成时间；重排或调整每组数量后，练过的组合仍然是「已完成」，只有含没练过的词的组会回到待练习。
- **主题**：跟随系统 / 浅色 / 深色三态切换，偏好存在 `localStorage`，首帧即生效（无闪白）。
- **本地存储**：数据存放在浏览器的 IndexedDB，可随时导出／导入 JSON 备份。

## 从 Anki 自动收录

复习时按「重来」的单词，可以不再手抄——配套的 Anki 插件会把它们送进词锚。
详见 [`anki-addon/README.md`](anki-addon/README.md)。

1. **装插件**：把 `anki-addon/word_anchor_sync/` 复制到 Anki 的 `addons21/`，重启。
2. **一次性设置**：**工具 → 词锚 Word Anchor → 设置…**，填站点地址与单词／释义字段。
3. **开始收录**：复习时按「重来」就会进队列；要学习时选
   - **打开词锚收录** → 打开 `站点/#inbox=<payload>`，页面自动入库、报数，payload 随即从地址栏清掉；
   - 或 **复制到剪贴板** → 到「单词库」页的「从 Anki 快速收录」点一下「从剪贴板收录」。

两条通道都只在本机完成：剪贴板不联网，深链的 payload 在 URL fragment 里，**不会发送给任何服务器**。
同一个词不会重复入库（按单词去重，保留原有释义）；但如果这是 Anki 里**新的一次抓取**（`capturedAt` 比库里记录的新），它会把这个词挪到队尾并清掉「练过」标记，让它再练一次。重发同一批（时间戳没变）只去重，不会打乱顺序。

## 启动

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。

首次打开时词库为空，请从「单词库」添加第一个单词。

## 验证

```bash
pnpm verify       # 类型 → lint → 类名一致性 → 单测 → 构建
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint（flat config，eslint-config-next）
pnpm test         # vitest（纯函数 + 对话框/主题组件）
pnpm check:css    # 守卫：TSX 里用到的类名必须在样式表中存在
pnpm check:unused # 咨询：列出没被引用的类与设计令牌（不阻塞）

python -m unittest discover anki-addon/tests   # Anki 插件的线格式与字段清洗
```

`pnpm check:css` 是为了防止「用了但没写」的样式类——首页空态曾经因为 `.empty-card`
在 CSS 中不存在而渲染成无边框纯文本。人工回归清单见 [`docs/qa.md`](docs/qa.md)。

## 数据存在哪里

- 词库、每组数量、清单完成记录都在浏览器的 IndexedDB（库名 `word-anchor`）里，**不会上传到任何地方**。
- 主题偏好是唯一存放在 `localStorage`（键 `word-anchor:theme`）的数据，因为它必须在首帧之前同步读出。
- 数据按浏览器隔离：换浏览器、换设备、清理站点数据后都看不到原来的词库。
- Anki 插件送来的单词也走同一条路：从剪贴板或 URL fragment 读进浏览器，**不经过任何服务器**。
- 「单词库」页底部提供 **导出备份 / 导入备份 / 清空数据**，导出文件是纯 JSON，可放进 iCloud、坚果云或 git 里长期保存。

## 技术栈

- Next.js 16（App Router，`output: "export"` 静态导出）
- React 19
- TypeScript
- IndexedDB（浏览器本地存储，零运行时依赖）
- 原生 CSS：`@layer` 分层 + CSS Modules，无 CSS 框架
- Crimson Pro（OFL，latin 子集 48KB，经 `next/font/local` 自托管）用于英文词与数字；中文一律走系统黑体

## 常用命令

```bash
pnpm dev      # 开发模式
pnpm build    # 构建静态站点，产物在 out/
pnpm preview  # 本地预览 out/ 目录
```

## 部署到 GitHub Pages

1. 把仓库推送到 GitHub，在 **Settings → Pages → Build and deployment** 里把 Source 选成 **GitHub Actions**。
2. 推送到 `main` 分支，`.github/workflows/deploy.yml` 会自动构建并发布。

项目站点（`https://<user>.github.io/<repo>/`）需要子路径前缀，工作流里已经自动传入：

```bash
NEXT_PUBLIC_BASE_PATH=/<repo> pnpm build
```

换成自定义域名（根路径部署）时，删掉工作流中的 `NEXT_PUBLIC_BASE_PATH` 即可。本地开发不需要设置它。

## 结构

```text
src/
├── app/
│   ├── layout.tsx            # 字体、主题首帧脚本、skip link、页头页脚
│   ├── page.tsx              # 首页：一句话 + 统计 + 下一份清单的板面骨架（右列留白）
│   ├── lists/                # 学习清单（账本行）
│   ├── practice/             # 连线练习（/practice/?list=3）
│   └── words/                # 单词管理 + 备份
├── components/
│   ├── ui/                   # Dialog（焦点陷阱）/ Pager（页码条）/ buttonClass
│   ├── practice-session.tsx  # 练习板本体（拖拽 + 点击 + 键盘）
│   ├── theme-toggle.tsx      # 三态主题切换
│   └── list-row.tsx          # 首页与清单页共用的账本行
├── lib/
│   ├── data.ts               # 纯函数：分组、校验、清单签名（零 I/O）
│   ├── store.ts              # IndexedDB 读写、内存快照、订阅与操作
│   ├── backup.ts             # 备份序列化 / 校验 / 下载
│   ├── theme.ts              # 主题偏好与首帧脚本
│   ├── pagination.ts         # 分页与页码窗口（纯函数）
│   ├── board.ts              # 两列洗牌与错排约束（纯函数，可注入随机源）
│   ├── reveal-region.ts      # 翻页后滚动 + 聚焦区块
│   ├── use-page-reveal.ts    # 页码变化时露出区块的 hook
│   ├── geometry.ts           # 连线曲线的唯一来源
│   └── use-app-data.ts       # useSyncExternalStore 接入 React
└── styles/
    ├── tokens.css            # 颜色 / 字体 / 字阶 / 圆角 / 动效令牌
    ├── base.css              # reset、焦点、skip link、scroll-padding
    └── atoms.css             # 按钮、状态、空态、页头等全局原子类
```

> 清单编号与分组会在词库或每组数量变化后重新计算；「练过」按单词记，所以分组变了以后，全由练过的词组成的组仍然是「已完成」，含没练过的词的组会回到「待练习」。
>
> 静态导出无法为任意清单编号预生成页面，因此练习页使用查询参数：`/practice/?list=<编号>`。

## Anki 插件目录

```text
anki-addon/
├── README.md                 # 安装、设置、故障排查
├── build.py                  # 打包成 dist/word-anchor-sync.ankiaddon
├── tests/test_wire.py        # 线格式与字段清洗（stdlib unittest）
└── word_anchor_sync/
    ├── __init__.py           # reviewer_did_answer_card 钩子
    ├── wire.py               # 线格式 v1（与 src/lib/intake.ts 一一对应）
    ├── capture.py            # HTML 清洗、字段映射
    ├── queue_store.py        # user_files/queue.json，原子写盘
    ├── ui.py                 # 菜单、设置、预览、两条发送通道
    └── config.py / log.py
```
