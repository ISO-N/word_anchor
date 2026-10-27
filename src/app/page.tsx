"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Layers3,
  LibraryBig,
  ListChecks,
  Plus,
  Sparkles,
} from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { getListOverview } from "@/lib/data";
import { formatShortDate } from "@/lib/format";
import { useAppData } from "@/lib/use-app-data";

export default function HomePage() {
  const data = useAppData();

  if (!data) {
    return <DataPlaceholder />;
  }

  const { words, lists, settings } = getListOverview(data);
  const completedCount = lists.filter((list) => list.status === "completed").length;
  const nextList = lists.find((list) => list.status === "ready");
  const progress = lists.length
    ? Math.round((completedCount / lists.length) * 100)
    : 0;
  const previewLists = lists.slice(0, 3);
  const showcaseWords = words.slice(0, 2);

  return (
    <div className="home-page">
      <section className="shell hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" />
            A QUIET PLACE FOR WORDS
          </p>
          <h1>
            把单词，
            <br />
            <em>锚定</em>在记忆里。
          </h1>
          <p className="hero-description">
            收集那些想记住的词，让清单替你排好顺序。
            <br className="desktop-only" />
            一次一组，用连线把词义重新系在一起。
          </p>
          <div className="hero-actions">
            <Link
              href={nextList ? `/practice/?list=${nextList.index}` : "/lists"}
              className="button button-primary"
            >
              {nextList ? "继续今天的练习" : "查看学习清单"}
              <ArrowRight size={18} />
            </Link>
            <Link href="/words" className="button button-ghost">
              <Plus size={18} />
              添加新单词
            </Link>
          </div>
          <div className="hero-footnote">
            <span className="avatar-stack" aria-hidden="true">
              <span>A</span>
              <span>B</span>
              <span>C</span>
            </span>
            <span>按录入顺序编排，每 {settings.listSize} 个词一组</span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-inner" />
          <div className="orbit-note orbit-note-top">REMEMBER</div>
          <div className="orbit-note orbit-note-bottom">ANCHOR</div>
          <div className="anchor-medallion">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v16M8 8h8M6 13c0 4.4 2.7 7 6 7s6-2.6 6-7M6 13a2 2 0 1 0 0 .1M18 13a2 2 0 1 0 0 .1"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span>词锚</span>
          </div>

          {showcaseWords[0] && (
            <div className="floating-word word-card-one">
              <div className="word-card-top">
                <span>01</span>
                <span className="word-card-dot" />
              </div>
              <strong>{showcaseWords[0].term}</strong>
              <small>{showcaseWords[0].meaning}</small>
            </div>
          )}
          {showcaseWords[1] && (
            <div className="floating-word word-card-two">
              <div className="word-card-top">
                <span>02</span>
                <span className="word-card-dot" />
              </div>
              <strong>{showcaseWords[1].term}</strong>
              <small>{showcaseWords[1].meaning}</small>
            </div>
          )}
          <div className="hero-visual-badge">
            <Sparkles size={15} />
            {words.length > 0 ? `${words.length} 个词，慢慢来` : "从第一个词开始"}
          </div>
        </div>
      </section>

      <section className="shell stats-strip" aria-label="学习概览">
        <div className="stat-cell">
          <span className="stat-icon"><LibraryBig size={19} /></span>
          <div>
            <strong>{words.length}</strong>
            <span>词库总量</span>
          </div>
        </div>
        <div className="stat-cell">
          <span className="stat-icon"><Layers3 size={19} /></span>
          <div>
            <strong>{lists.length}</strong>
            <span>已编排清单</span>
          </div>
        </div>
        <div className="stat-cell">
          <span className="stat-icon"><ListChecks size={19} /></span>
          <div>
            <strong>{completedCount}</strong>
            <span>完成练习</span>
          </div>
        </div>
        <div className="stat-cell stat-cell-accent">
          <span className="stat-icon"><BookOpen size={19} /></span>
          <div>
            <strong>{settings.listSize}</strong>
            <span>每组单词数</span>
          </div>
        </div>
      </section>

      <section className="shell home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR STUDY LISTS</p>
            <h2>今天，从哪一组开始？</h2>
          </div>
          <Link href="/lists" className="text-link">
            查看全部清单
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="home-list-layout">
          <div className="preview-list">
            {previewLists.length > 0 ? (
              previewLists.map((list) => (
                <Link
                  key={list.signature}
                  href={`/practice/?list=${list.index}`}
                  className={`preview-row${list.status === "completed" ? " is-completed" : ""}`}
                >
                  <span className="preview-index">
                    {String(list.index).padStart(2, "0")}
                  </span>
                  <span className="preview-copy">
                    <span className="preview-meta">
                      LIST {String(list.index).padStart(2, "0")} · 第{" "}
                      {list.startOrder}–{list.endOrder} 个词
                    </span>
                    <strong>
                      {list.words
                        .slice(0, 3)
                        .map((word) => word.term)
                        .join(" · ")}
                      {list.words.length > 3 ? " …" : ""}
                    </strong>
                  </span>
                  <span
                    className={`status-pill ${list.status === "completed" ? "status-completed" : "status-ready"}`}
                  >
                    {list.status === "completed" ? (
                      <>
                        <Check size={13} /> 已完成
                      </>
                    ) : (
                      <>
                        <span className="status-dot" /> 待练习
                      </>
                    )}
                  </span>
                  <span className="preview-arrow">
                    <ArrowUpRight size={19} />
                  </span>
                </Link>
              ))
            ) : (
              <div className="empty-card compact-empty">
                <span className="empty-icon"><LibraryBig size={24} /></span>
                <div>
                  <h3>第一次从添加单词开始</h3>
                  <p>词库有内容后，会自动生成学习清单。</p>
                </div>
                <Link href="/words" className="button button-primary button-small">
                  去添加单词
                </Link>
              </div>
            )}
          </div>

          <aside className="focus-panel">
            <div className="focus-panel-top">
              <span className="eyebrow">TODAY&apos;S RHYTHM</span>
              <span className="circle-progress" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
                <span>{progress}%</span>
              </span>
            </div>
            <h3>总掌握进度</h3>
            <p>
              {lists.length === 0
                ? "还没有学习清单，添加一些单词就能开始。"
                : completedCount === lists.length
                  ? "所有清单都已完成，给记忆一次轻柔的复习吧。"
                  : `已完成 ${completedCount} / ${lists.length} 份清单，按自己的节奏来。`}
            </p>
            <div className="focus-divider" />
            <div className="focus-next">
              <span className="focus-next-label">
                {lists.length === 0 ? "开始之前" : "下一组"}
              </span>
              {nextList ? (
                <>
                  <strong>
                    LIST {String(nextList.index).padStart(2, "0")}
                  </strong>
                  <span>
                    {nextList.words
                      .slice(0, 2)
                      .map((word) => word.term)
                      .join(" / ")}
                  </span>
                  <Link href={`/practice/?list=${nextList.index}`} className="focus-next-link">
                    现在开始 <ArrowRight size={15} />
                  </Link>
                </>
              ) : lists.length === 0 ? (
                <>
                  <strong>先收进一个词</strong>
                  <span>词库有内容后会自动编排清单</span>
                  <Link href="/words" className="focus-next-link">
                    添加单词 <ArrowRight size={15} />
                  </Link>
                </>
              ) : (
                <>
                  <strong>全部完成</strong>
                  <span>可以选择任意清单温习</span>
                  <Link href="/lists" className="focus-next-link">
                    查看清单 <ArrowRight size={15} />
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="shell method-section">
        <div className="method-intro">
          <p className="eyebrow">A SIMPLE METHOD</p>
          <h2>少一点负担，<br />多一点记住。</h2>
          <p>词锚不催促你完成更多，只帮你把注意力留在眼前这一组。</p>
        </div>
        <div className="method-steps">
          <div className="method-step">
            <span>01</span>
            <div>
              <h3>收进词库</h3>
              <p>手动记录单词与释义，重复的词会提前提醒。</p>
            </div>
          </div>
          <div className="method-step">
            <span>02</span>
            <div>
              <h3>自动编排</h3>
              <p>按录入时间先进先出，每 N 个词归入一份清单。</p>
            </div>
          </div>
          <div className="method-step">
            <span>03</span>
            <div>
              <h3>连线巩固</h3>
              <p>词义打乱后重新配对，让回忆主动发生。</p>
            </div>
          </div>
        </div>
      </section>

      {words.length > 0 && (
        <section className="shell recent-words">
          <span className="recent-label">最近收录</span>
          <div className="recent-word-list">
            {words
              .slice(-5)
              .reverse()
              .map((word) => (
                <span key={word.id} className="recent-word-chip">
                  {word.term}
                  <small>{formatShortDate(word.createdAt)}</small>
                </span>
              ))}
          </div>
          <Link href="/words" className="text-link">
            管理词库 <ArrowRight size={15} />
          </Link>
        </section>
      )}
    </div>
  );
}
