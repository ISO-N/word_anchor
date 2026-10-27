"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { ListRow } from "@/components/list-row";
import { PracticePreview } from "@/components/practice-preview";
import { buttonClass } from "@/components/ui/button";
import { getListOverview } from "@/lib/data";
import { formatShortDate } from "@/lib/format";
import { useAppData } from "@/lib/use-app-data";
import styles from "./page.module.css";

export default function HomePage() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder />;
  }

  const { words, lists } = getListOverview(data);
  const completedCount = lists.filter((list) => list.status === "completed").length;
  const nextList = lists.find((list) => list.status === "ready");
  const focusList = nextList ?? lists[0] ?? null;
  const progress = lists.length
    ? Math.round((completedCount / lists.length) * 100)
    : 0;
  const previewRows = lists.slice(0, 3);
  const recentWords = words.slice(-6).reverse();

  return (
    <div className={`shell ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.intro}>
          <h1 className={styles.title} id="home-title">
            把单词锚定在记忆里。
          </h1>

          <p className={styles.meta}>
            {words.length} 个词 · {lists.length} 份清单
          </p>

          {lists.length > 0 && (
            <div className={styles.status}>
              <span className={styles.statusLabel}>
                已完成 {completedCount} / {lists.length}
              </span>
              <span className={`progress-rule ${styles.bar}`}>
                <span style={{ width: `${progress}%` }} />
              </span>
            </div>
          )}

          <div className={styles.actions}>
            {focusList ? (
              <Link
                href={`/practice/?list=${focusList.index}`}
                className={buttonClass()}
              >
                {nextList
                  ? `继续 LIST ${String(nextList.index).padStart(2, "0")}`
                  : "温习一份清单"}
                <ArrowRight size={17} strokeWidth={1.8} />
              </Link>
            ) : null}
            <Link
              href="/words"
              className={buttonClass({ variant: "ghost" })}
            >
              <Plus size={17} strokeWidth={1.8} />
              添加单词
            </Link>
          </div>
        </div>

        {focusList ? (
          <aside className={styles.preview} aria-label="下一次要练习的清单">
            <div className={styles.previewHead}>
              <span className={styles.previewNumber} translate="no">
                LIST {String(focusList.index).padStart(2, "0")}
              </span>
              <span className={styles.previewRange}>
                第 {focusList.startOrder}–{focusList.endOrder} 个词
              </span>
            </div>

            <PracticePreview words={focusList.words.slice(0, 5)} />

            <Link
              href={`/practice/?list=${focusList.index}`}
              className={styles.previewAction}
            >
              <span>{nextList ? "开始连线" : "再练一次"}</span>
              <ArrowRight size={16} strokeWidth={1.8} />
            </Link>
          </aside>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Plus size={20} strokeWidth={1.8} />
            </span>
            <h2>从第一个单词开始</h2>
            <p>
              录入单词与释义后，词锚会按录入顺序每组 {data.settings.listSize}{" "}
              个自动编排清单。
            </p>
            <Link href="/words" className={buttonClass()}>
              添加第一个单词
            </Link>
          </div>
        )}
      </section>

      {previewRows.length > 0 && (
        <section className={styles.section} aria-labelledby="home-lists-title">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="home-lists-title">
              全部清单
            </h2>
            <Link href="/lists" className="text-link">
              查看全部
              <ArrowRight size={15} strokeWidth={1.8} />
            </Link>
          </div>

          <div className={styles.rows}>
            {previewRows.map((list) => (
              <ListRow
                key={list.signature}
                list={list}
                isNext={list.index === nextList?.index}
              />
            ))}
          </div>
        </section>
      )}

      {recentWords.length > 0 && (
        <section className={styles.section} aria-labelledby="home-recent-title">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="home-recent-title">
              最近收录
            </h2>
            <Link href="/words" className="text-link">
              管理词库
              <ArrowRight size={15} strokeWidth={1.8} />
            </Link>
          </div>

          <div className={styles.recent}>
            <span className={styles.recentLabel}>按录入时间排序</span>
            {recentWords.map((word) => (
              <span className={styles.chip} key={word.id}>
                <span lang="en" translate="no">
                  {word.term}
                </span>
                <span className={styles.chipDate}>
                  {formatShortDate(word.createdAt)}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
