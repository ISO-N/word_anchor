import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { StudyList } from "@/lib/types";
import styles from "./list-row.module.css";

type ListRowProps = {
  list: StudyList;
  /** 当前应练习的清单：左侧一道墨线，不额外增加一个按钮 */
  isNext?: boolean;
};

export function ListRow({ list, isNext = false }: ListRowProps) {
  const completed = list.status === "completed";
  const firstWord = list.words[0]?.term ?? "空清单";
  const label = `清单 ${list.index}，${firstWord} 等 ${list.words.length} 个词，第 ${list.startOrder} 至 ${list.endOrder} 个词，${completed ? "已完成" : "待练习"}`;

  return (
    <Link
      href={`/practice/?list=${list.index}`}
      className={`${styles.row}${isNext ? ` ${styles.next}` : ""}`}
      aria-label={label}
    >
      <span className={styles.number}>{String(list.index).padStart(2, "0")}</span>

      <span className={styles.head}>
        <span className={styles.term} lang="en" translate="no">
          {firstWord}
        </span>
        <span className={styles.summary}>
          {list.words.length > 1
            ? `等 ${list.words.length} 个词`
            : "1 个词"}
          {list.isPartial ? "，未满一组" : ""}
        </span>
      </span>

      <span className={styles.range}>
        第 {list.startOrder}–{list.endOrder} 个词
      </span>

      <span
        className={`status-pill ${completed ? "status-completed" : "status-ready"}`}
      >
        {completed ? (
          <>
            <Check size={12} strokeWidth={2.4} />
            已完成
          </>
        ) : (
          <>
            <span className="status-dot" />
            待练习
          </>
        )}
      </span>

      <ArrowUpRight className={styles.arrow} size={18} strokeWidth={1.6} />
    </Link>
  );
}
