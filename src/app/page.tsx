"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { ListRow } from "@/components/list-row";
import { PracticePreview } from "@/components/practice-preview";
import { buttonClass } from "@/components/ui/button";
import { getListIndexByWordId, getListOverview } from "@/lib/data";
import { formatIndex, formatListLabel, formatShortDate } from "@/lib/format";
import { useAppData } from "@/lib/use-app-data";
import styles from "./page.module.css";

/** 入场延迟：标题 0，板面 1，下面两个分区 2 */
const rise = (step: number): CSSProperties =>
  ({ "--i": step }) as CSSProperties;

export default function HomePage() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder />;
  }

  const { words, lists } = getListOverview(data);
  const listIndexByWordId = getListIndexByWordId(data);
  const completedCount = lists.filter((list) => list.status === "completed").length;
  const nextList = lists.find((list) => list.status === "ready");
  const focusList = nextList ?? lists[0] ?? null;
  const progress = lists.length
    ? Math.round((completedCount / lists.length) * 100)
    : 0;
  const previewRows = lists.slice(0, 3);
  const recentWords = words.slice(-6).reverse();

  return (
    <div className={`shell page-fill ${styles.page}`}>
      <section className={`rise ${styles.head}`} style={rise(0)}>
        <h1 className={styles.title} id="home-title">
          把单词锚定在记忆里。
        </h1>

        {lists.length > 0 ? (
          <div className={styles.progress}>
            <p className={styles.progressText}>
              完成 {completedCount} / {lists.length} 份清单
            </p>
            <span className={`progress-rule ${styles.track}`}>
              <span style={{ width: `${progress}%` }} />
            </span>
          </div>
        ) : (
          <p className={styles.progressText}>词库还空着，先记下第一个词。</p>
        )}
      </section>

      {focusList ? (
        <section
          className={`rise ${styles.board}`}
          style={rise(1)}
          aria-labelledby="home-board-title"
        >
          <div className={styles.boardSide}>
            <p className={styles.boardNumber} id="home-board-title" translate="no">
              LIST {formatIndex(focusList.index)}
            </p>
            <p className={styles.boardMeta}>
              第 {focusList.startOrder}–{focusList.endOrder} 个词 ·{" "}
              {focusList.words.length} 个词
            </p>

            <span
              className={`status-pill ${
                focusList.status === "completed"
                  ? "status-completed"
                  : "status-ready"
              }`}
            >
              {focusList.status === "completed"
                ? "练过一次"
                : focusList.isPartial
                  ? "未满一组"
                  : "待练习"}
            </span>

            <Link
              href={`/practice/?list=${focusList.index}`}
              className={`${buttonClass()} ${styles.boardAction}`}
            >
              {nextList ? "开始连线" : "再练一次"}
              <ArrowRight size={16} strokeWidth={1.9} />
            </Link>
          </div>

          <div className={styles.boardPreview}>
            <PracticePreview words={focusList.words.slice(0, 5)} />
          </div>
        </section>
      ) : (
        <div className="empty-stage">
          <div className="rise empty-state" style={rise(1)}>
            <span className="empty-state-icon">
              <Plus size={22} strokeWidth={1.8} aria-hidden="true" />
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
        </div>
      )}

      {previewRows.length > 0 && (
        <section
          className={`rise ${styles.section}`}
          style={rise(2)}
          aria-labelledby="home-lists-title"
        >
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle} id="home-lists-title">
                后面的清单
              </h2>
              <p className={styles.sectionNote}>
                {focusList
                  ? `${formatListLabel(focusList.index)} 之后`
                  : "按录入顺序排"}
              </p>
            </div>
            <Link href="/lists" className="text-link">
              查看全部 {lists.length} 份
              <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
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
        <section
          className={`rise ${styles.section}`}
          style={rise(2)}
          aria-labelledby="home-recent-title"
        >
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle} id="home-recent-title">
                最近收录
              </h2>
              <p className={styles.sectionNote}>按录入时间排序</p>
            </div>
            <Link href="/words" className="text-link">
              管理词库
              <ArrowRight size={15} strokeWidth={1.9} aria-hidden="true" />
            </Link>
          </div>

          <ul className={styles.recent}>
            {recentWords.map((word) => {
              const listIndex = listIndexByWordId.get(word.id);

              return (
                <li className={styles.recentRow} key={word.id}>
                  <span className={styles.recentTerm} lang="en" translate="no">
                    {word.term}
                  </span>
                  <span className={styles.recentList} translate="no">
                    {listIndex === undefined
                      ? "—"
                      : formatListLabel(listIndex)}
                  </span>
                  <span className={styles.recentDate}>
                    {formatShortDate(word.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
