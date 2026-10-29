"use client";

import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { ReviewSession } from "@/components/review-session";
import { buttonClass } from "@/components/ui/button";
import { useAppData } from "@/lib/use-app-data";
import styles from "./page.module.css";

/**
 * 趣味复习：从全库随机抽一个单词，再抽 3 个其他词的释义当干扰项。
 * 入口独立于连线练习，不读写清单完成状态。
 */
export default function ReviewPage() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder label="正在准备复习…" />;
  }

  return (
    <div className="shell page-shell">
      {data.words.length < 2 ? (
        <ReviewEmptyState hasWords={data.words.length === 1} />
      ) : (
        <ReviewSession words={data.words} />
      )}
    </div>
  );
}

function ReviewEmptyState({ hasWords }: { hasWords: boolean }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        {hasWords ? (
          <Sparkles size={20} strokeWidth={1.8} />
        ) : (
          <Plus size={20} strokeWidth={1.8} />
        )}
      </span>
      <h1>{hasWords ? "再添一个词就能开始" : "词库还是空的"}</h1>
      <p>
        {hasWords
          ? "趣味复习至少要两个单词，才能凑出一个正确答案和一个干扰项。"
          : "先录入几个单词与释义，随机复习题就会从词库里长出来。"}
      </p>
      <div className={styles.emptyActions}>
        <Link href="/words" className={buttonClass()}>
          去添加单词
          <ArrowRight size={16} strokeWidth={1.8} />
        </Link>
        <Link href="/lists" className={buttonClass({ variant: "ghost" })}>
          返回清单
        </Link>
      </div>
    </div>
  );
}
