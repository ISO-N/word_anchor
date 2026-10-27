# 词锚 Word Anchor

一个使用 Next.js 构建的单词记忆工具。核心流程是：管理词库 → 按 FIFO 自动编排学习清单 → 通过连线练习配对单词与释义。

整套应用是纯静态站点：构建产物可以直接托管在 GitHub Pages，词库和练习记录保存在**每个访问者自己的浏览器**里，不经过任何服务器。

## 功能

- **单词管理**：手动添加、编辑、删除和搜索单词及释义，单词去重（忽略大小写）。
- **FIFO 清单**：按录入时间先进先出分组，可设置每组 2–20 个单词，修改后清单立即重新编排。
- **连线练习**：左右两列打乱顺序，支持点击配对或拖拽连线；正确连线以绿色标记，错误连线以虚线提示，全部配对后自动记录完成状态。
- **进度记录**：记录已完成的清单，回访时仍可重复练习。
- **本地存储**：数据存放在浏览器的 IndexedDB，可随时导出／导入 JSON 备份。

## 启动

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。

首次打开时词库为空，请从「单词库」添加第一个单词。

## 数据存在哪里

- 词库、每组数量、清单完成记录都在浏览器的 IndexedDB（库名 `word-anchor`）里，**不会上传到任何地方**。
- 数据按浏览器隔离：换浏览器、换设备、清理站点数据后都看不到原来的词库。
- 「单词库」页底部提供 **导出备份 / 导入备份 / 清空数据**，导出文件是纯 JSON，可放进 iCloud、坚果云或 git 里长期保存。

## 技术栈

- Next.js 16（App Router，`output: "export"` 静态导出）
- React 19
- TypeScript
- IndexedDB（浏览器本地存储，零运行时依赖）
- 原生 CSS

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
│   ├── lists/                # 学习清单
│   ├── practice/             # 连线练习（/practice/?list=3）
│   └── words/                # 单词管理 + 备份
├── components/               # 页面交互组件
└── lib/
    ├── data.ts               # 纯函数：分组、校验、清单签名（零 I/O）
    ├── store.ts              # IndexedDB 读写、内存快照、订阅与操作
    ├── use-app-data.ts       # useSyncExternalStore 接入 React
    └── backup.ts             # 备份序列化 / 校验 / 下载
```

> 清单编号与分组会在词库或每组数量变化后重新计算，历史完成记录以「清单包含的单词 ID」作为签名关联；当分组变化时，旧进度可能不再显示。
>
> 静态导出无法为任意清单编号预生成页面，因此练习页使用查询参数：`/practice/?list=<编号>`。
