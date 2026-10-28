"use client";

import { Suspense, useMemo } from "react";
import { DataBackup } from "@/components/data-backup";
import { DataPlaceholder } from "@/components/data-placeholder";
import { WordIntake } from "@/components/word-intake";
import { WordManager } from "@/components/word-manager";
import { getListIndexByWordId } from "@/lib/data";
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
  /* 每一行的「清单」编号与清单页同源：都由分组结果反查，与搜索、分页无关 */
  const listIndexByWordId = useMemo(
    () => (data ? getListIndexByWordId(data) : new Map<number, number>()),
    [data],
  );

  if (!data) {
    return <DataPlaceholder />;
  }

  return (
    <div className="shell page-shell">
      <WordManager
        words={data.words}
        listIndexByWordId={listIndexByWordId}
        intro={<WordIntake />}
      />
      <DataBackup />
    </div>
  );
}
