"use client";

import { Suspense } from "react";
import { DataBackup } from "@/components/data-backup";
import { DataPlaceholder } from "@/components/data-placeholder";
import { WordManager } from "@/components/word-manager";
import { useAppData } from "@/lib/use-app-data";

/**
 * 静态导出下用查询参数保存搜索词与页码：
 * /words/?q=serendipity&page=2
 * useSearchParams 需要 Suspense 边界，因此在页面层包裹。
 */
export default function WordsPage() {
  return (
    <Suspense fallback={<DataPlaceholder />}>
      <WordsView />
    </Suspense>
  );
}

function WordsView() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder />;
  }

  return (
    <div className="shell page-shell">
      <WordManager words={data.words} />
      <DataBackup />
    </div>
  );
}
