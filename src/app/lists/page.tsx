"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Layers3,
  ListChecks,
  Plus,
  Sparkles,
} from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { ListSizeControl } from "@/components/list-size-control";
import { getListOverview } from "@/lib/data";
import { formatShortDate } from "@/lib/format";
import { useAppData } from "@/lib/use-app-data";

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
          <p className="eyebrow">STUDY LISTS · FIFO</p>
          <h1>学习清单</h1>
          <p className="page-description">
            按录入顺序先进先出，每份清单都是一次安静的回顾。
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/words" className="button button-ghost">
            <Plus size={17} />
            添加单词
          </Link>
          {nextList && (
            <Link
              href={`/practice/?list=${nextList.index}`}
              className="button button-primary"
            >
              开始下一组
              <ArrowRight size={17} />
            </Link>
          )}
        </div>
      </section>

      <section className="lists-toolbar">
        <div className="list-overview">
          <div className="overview-stat">
            <Layers3 size={18} />
            <span>
              <strong>{lists.length}</strong> 份清单
            </span>
          </div>
          <div className="overview-stat">
            <ListChecks size={18} />
            <span>
              <strong>{completedCount}</strong> 已完成
            </span>
          </div>
          <div className="overview-progress">
            <span className="overview-progress-track">
              <span style={{ width: `${progress}%` }} />
            </span>
            <span>{progress}%</span>
          </div>
        </div>
        <ListSizeControl />
      </section>

      {words.length === 0 ? (
        <div className="empty-state">
          <span className="empty-illustration">
            <Layers3 size={34} />
          </span>
          <h2>还没有可编排的单词</h2>
          <p>往词库里添加单词，学习清单就会自动出现。</p>
          <Link href="/words" className="button button-primary">
            <Plus size={18} />
            去添加单词
          </Link>
        </div>
      ) : (
        <>
          <section className="fifo-note">
            <span className="fifo-icon">
              <Clock3 size={20} />
            </span>
            <div>
              <strong>先进先出，不遗漏也不插队</strong>
              <p>
                最早的单词会先进入 LIST 01，排满 {settings.listSize} 个后开启下一份。
                修改每组数量时，清单会立即重新编排。
              </p>
            </div>
            <span className="fifo-path" aria-hidden="true">
              <span>最早</span>
              <span className="fifo-line" />
              <ArrowRight size={14} />
              <span className="fifo-line" />
              <span>最新</span>
            </span>
          </section>

          <section className="list-grid" aria-label="学习清单">
            {lists.map((list) => (
              <Link
                key={list.signature}
                href={`/practice/?list=${list.index}`}
                className={`list-card${list.status === "completed" ? " is-completed" : ""}`}
              >
                <div className="list-card-top">
                  <span className="list-number">
                    {String(list.index).padStart(2, "0")}
                  </span>
                  <span
                    className={`status-pill ${list.status === "completed" ? "status-completed" : "status-ready"}`}
                  >
                    {list.status === "completed" ? (
                      <>
                        <Check size={13} />
                        已完成
                      </>
                    ) : (
                      <>
                        <span className="status-dot" />
                        待练习
                      </>
                    )}
                  </span>
                </div>

                <div className="list-card-heading">
                  <span className="list-kicker">LIST {String(list.index).padStart(2, "0")}</span>
                  <h2>{list.words[0]?.term}</h2>
                  <span className="list-card-tail">
                    {list.words.length > 1
                      ? `等 ${list.words.length} 个词`
                      : "1 个词"}
                  </span>
                </div>

                <div className="list-word-preview">
                  {list.words.map((word) => (
                    <span key={word.id}>{word.term}</span>
                  ))}
                </div>

                <div className="list-card-meta">
                  <span>
                    第 {list.startOrder}–{list.endOrder} 个词
                  </span>
                  {list.completedAt ? (
                    <span>{formatShortDate(list.completedAt)} 完成</span>
                  ) : list.isPartial ? (
                    <span className="list-partial">
                      <Sparkles size={13} />
                      未满一组
                    </span>
                  ) : (
                    <span>{list.words.length} 组连线</span>
                  )}
                </div>

                <span className="list-card-action">
                  {list.status === "completed" ? "再练一次" : "开始连线"}
                  <ArrowUpRight size={18} />
                </span>
              </Link>
            ))}
          </section>

          <section className="next-step-strip">
            <div>
              <span className="eyebrow">READY WHEN YOU ARE</span>
              <h2>
                {nextList
                  ? `下一份是 LIST ${String(nextList.index).padStart(2, "0")}`
                  : "所有清单都已完成"}
              </h2>
              <p>
                {nextList
                  ? `${nextList.words.slice(0, 2).map((word) => word.term).join(" / ")} 正在等你重新认识。`
                  : "记忆需要反复，挑一份清单再练一次吧。"}
              </p>
            </div>
            {nextList ? (
              <Link href={`/practice/?list=${nextList.index}`} className="button button-primary">
                进入连线
                <ArrowRight size={17} />
              </Link>
            ) : (
              <Link href="/practice/?list=1" className="button button-primary">
                温习 LIST 01
                <ArrowRight size={17} />
              </Link>
            )}
          </section>
        </>
      )}
    </div>
  );
}
