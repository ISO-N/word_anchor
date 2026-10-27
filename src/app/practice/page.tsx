"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Layers3 } from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { PracticeSession } from "@/components/practice-session";
import { buttonClass } from "@/components/ui/button";
import { getListOverview, getStudyList } from "@/lib/data";
import { useAppData } from "@/lib/use-app-data";
import styles from "./page.module.css";

/**
 * 静态导出下无法为每个清单编号预生成页面，因此清单编号走查询参数：
 * /practice/?list=3
 */
export default function PracticePage() {
  return (
    <Suspense fallback={<DataPlaceholder label="正在打开练习…" />}>
      <PracticeView />
    </Suspense>
  );
}

function PracticeView() {
  const searchParams = useSearchParams();
  const data = useAppData();
  const listIndex = Number(searchParams.get("list") ?? "1");

  if (!data) {
    return <DataPlaceholder label="正在打开练习…" />;
  }

  const list =
    Number.isInteger(listIndex) && listIndex > 0
      ? getStudyList(data, listIndex)
      : null;

  if (!list) {
    return <MissingList hasWords={data.words.length > 0} />;
  }

  const nextList = getListOverview(data).lists.find(
    (item) => item.index === listIndex + 1,
  );

  return (
    <PracticeSession
      key={list.signature}
      listIndex={list.index}
      words={list.words}
      isPartial={list.isPartial}
      alreadyCompleted={list.status === "completed"}
      nextIndex={nextList?.index ?? null}
    />
  );
}

function MissingList({ hasWords }: { hasWords: boolean }) {
  return (
    <div className="shell page-shell">
      <div className="empty-state">
        <span className="empty-state-icon">
          <Layers3 size={20} strokeWidth={1.8} />
        </span>
        <h2>没有找到这份清单</h2>
        <p>
          {hasWords
            ? "调整每组单词数之后，清单会重新编排，编号也会随之变化。"
            : "词库还是空的，先添加几个单词吧。"}
        </p>
        <div className={styles.emptyActions}>
          <Link
            href={hasWords ? "/lists" : "/words"}
            className={buttonClass()}
          >
            {hasWords ? "查看学习清单" : "去添加单词"}
            <ArrowRight size={16} strokeWidth={1.8} />
          </Link>
          <Link href="/lists" className={buttonClass({ variant: "ghost" })}>
            返回清单
          </Link>
        </div>
      </div>
    </div>
  );
}
