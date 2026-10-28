# 词锚 Word Anchor

一个使用 Next.js 构建的单词记忆工具。核心流程是：管理词库 → 按 FIFO 自动编排学习清单 → 通过连线练习配对单词与释义。

整套应用是纯静态站点：构建产物可以直接托管在 GitHub Pages，词库和练习记录保存在**每个访问者自己的浏览器**里，不经过任何服务器。

## 功能

- **单词管理**：手动添加、编辑、删除和搜索单词及释义，单词去重（忽略大小写）；50 条一页，搜索词与页码写在 URL 里（`/words/?q=serendipity&page=2`），可分享、可后退。
- **FIFO 清单**：按录入时间先进先出分组，可设置每组 2–20 个单词，修改后清单立即重新编排。
- **连线练习**：左右两列打乱顺序，支持点击配对或拖拽连线；可选择**即时反馈**（连上即用墨绿／陶土虚线标出对错，全部连对自动完成）或**手动判定**（连线时不露对错，全部连好后点「判定」一次看清结果，错误连线保留可改）。键盘同样可以完成整轮练习。
- **进度记录**：记录已完成的清单，回访时仍可重复练习。
- **主题**：跟随系统 / 浅色 / 深色三态切换，偏好存在 `localStorage`，首帧即生效（无闪白）。
- **本地存储**：数据存放在浏览器的 IndexedDB，可随时导出／导入 JSON 备份。

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
```

`pnpm check:css` 是为了防止「用了但没写」的样式类——首页空态曾经因为 `.empty-card`
在 CSS 中不存在而渲染成无边框纯文本。人工回归清单见 [`docs/qa.md`](docs/qa.md)。

## 数据存在哪里

- 词库、每组数量、清单完成记录都在浏览器的 IndexedDB（库名 `word-anchor`）里，**不会上传到任何地方**。
- 主题偏好是唯一存放在 `localStorage`（键 `word-anchor:theme`）的数据，因为它必须在首帧之前同步读出。
- 数据按浏览器隔离：换浏览器、换设备、清理站点数据后都看不到原来的词库。
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
│   ├── page.tsx              # 首页：一句话 + 统计 + 下一份清单的板面预览
│   ├── lists/                # 学习清单（账本行）
│   ├── practice/             # 连线练习（/practice/?list=3）
│   └── words/                # 单词管理 + 备份
├── components/
│   ├── ui/                   # Dialog（焦点陷阱）/ buttonClass
│   ├── practice-session.tsx  # 练习板本体（拖拽 + 点击 + 键盘）
│   ├── theme-toggle.tsx      # 三态主题切换
│   └── list-row.tsx          # 首页与清单页共用的账本行
├── lib/
│   ├── data.ts               # 纯函数：分组、校验、清单签名（零 I/O）
│   ├── store.ts              # IndexedDB 读写、内存快照、订阅与操作
│   ├── backup.ts             # 备份序列化 / 校验 / 下载
│   ├── theme.ts              # 主题偏好与首帧脚本
│   ├── pagination.ts         # 分页（纯函数）
│   ├── geometry.ts           # 连线曲线的唯一来源
│   └── use-app-data.ts       # useSyncExternalStore 接入 React
└── styles/
    ├── tokens.css            # 颜色 / 字体 / 字阶 / 圆角 / 动效令牌
    ├── base.css              # reset、焦点、skip link、scroll-padding
    └── atoms.css             # 按钮、状态、空态、页头等全局原子类
```

> 清单编号与分组会在词库或每组数量变化后重新计算，历史完成记录以「清单包含的单词 ID」作为签名关联；当分组变化时，旧进度可能不再显示。
>
> 静态导出无法为任意清单编号预生成页面，因此练习页使用查询参数：`/practice/?list=<编号>`。
