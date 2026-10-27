"use client";

import Link from "next/link";
import { ArrowRight, Layers3, Plus } from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { ListRow } from "@/components/list-row";
import { ListSizeControl } from "@/components/list-size-control";
import { buttonClass } from "@/components/ui/button";
import { getListOverview } from "@/lib/data";
import { useAppData } from "@/lib/use-app-data";
import styles from "./page.module.css";

export default function ListsPage() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder />;
  }

  const { lists, settings, words } = getListOverview(data);
  const completedCount = lists.filter((list) => list.status === "completed").length;
  const nextList = lists.find((list) => list.status === "ready");
  const progress = lists.length
    ? Math.round((completedCount / lists.length) * 100)
    : 0;

  return (
    <div className="shell page-shell">
      <section className="page-heading">
        <div>
          <h1>学习清单</h1>
          <p className="page-description">
            按录入顺序先进先出，每份清单都是一次安静的回顾。
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/words" className={buttonClass({ variant: "ghost" })}>
            <Plus size={17} strokeWidth={1.8} />
            添加单词
          </Link>
          {nextList && (
            <Link
              href={`/practice/?list=${nextList.index}`}
              className={buttonClass()}
            >
              开始下一组
              <ArrowRight size={17} strokeWidth={1.8} />
            </Link>
          )}
        </div>
      </section>

      <section className={styles.toolbar} aria-label="清单概览与设置">
        <div className={styles.overview}>
          <span>
            <strong>{lists.length}</strong> 份清单
          </span>
          <span>
            <strong>{completedCount}</strong> 已完成
          </span>
          <span className={styles.progress}>
            <span className={`progress-rule ${styles.progressBar}`}>
              <span style={{ width: `${progress}%` }} />
            </span>
            {progress}%
          </span>
        </div>
        <ListSizeControl />
      </section>

      {words.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <span className="empty-state-icon">
            <Layers3 size={20} strokeWidth={1.8} />
          </span>
          <h2>还没有可编排的单词</h2>
          <p>往词库里添加单词，学习清单就会自动出现。</p>
          <Link href="/words" className={buttonClass()}>
            <Plus size={17} strokeWidth={1.8} />
            去添加单词
          </Link>
        </div>
      ) : (
        <>
          <p className={styles.fifo}>
            最早的单词先进入 LIST 01，排满 {settings.listSize}{" "}
            个后开启下一份；修改每组数量会立即重新编排，编号也可能变化。
          </p>

          <div className={styles.rows}>
            {lists.map((list) => (
              <ListRow
                key={list.signature}
                list={list}
                isNext={list.index === nextList?.index}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
