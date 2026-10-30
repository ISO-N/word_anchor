"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { ArrowRight, Layers3, Plus } from "lucide-react";
import { DataPlaceholder } from "@/components/data-placeholder";
import { FeedbackModeControl } from "@/components/feedback-mode-control";
import { ListRow } from "@/components/list-row";
import { ListSizeControl } from "@/components/list-size-control";
import { buttonClass } from "@/components/ui/button";
import { Pager } from "@/components/ui/pager";
import { getListOverview } from "@/lib/data";
import { LIST_PAGE_SIZE, paginate, parsePageParam } from "@/lib/pagination";
import { useAppData } from "@/lib/use-app-data";
import { usePageReveal } from "@/lib/use-page-reveal";
import styles from "./page.module.css";

/** 入场延迟：标题 0，工具栏 1，行 2 */
const rise = (step: number): CSSProperties =>
  ({ "--i": step }) as CSSProperties;

/**
 * 静态导出下用查询参数保存页码：/lists/?page=2
 * useSearchParams 需要 Suspense 边界，因此在页面层包裹（与 /words 同构）。
 */
export default function ListsPage() {
  return (
    <Suspense fallback={<DataPlaceholder />}>
      <ListsView />
    </Suspense>
  );
}

function ListsView() {
  const data = useAppData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rowsRef = useRef<HTMLDivElement | null>(null);

  const overview = useMemo(() => (data ? getListOverview(data) : null), [data]);
  const lists = useMemo(() => overview?.lists ?? [], [overview]);
  const page = parsePageParam(searchParams.get("page"));
  const pageData = useMemo(
    () => paginate(lists, page, LIST_PAGE_SIZE),
    [lists, page],
  );

  const requestReveal = usePageReveal(pageData.page, rowsRef);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (nextPage === pageData.page) return;

      requestReveal();

      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));

      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [pageData.page, pathname, requestReveal, router, searchParams],
  );

  if (!overview) {
    return <DataPlaceholder />;
  }

  const { settings, words } = overview;
  const completedCount = lists.filter((list) => list.status === "completed").length;
  const nextList = lists.find((list) => list.status === "ready");
  const nextPage = nextList ? Math.ceil(nextList.index / LIST_PAGE_SIZE) : null;
  const progress = lists.length
    ? Math.round((completedCount / lists.length) * 100)
    : 0;

  return (
    <div className={`shell page-fill page-shell ${styles.page}`}>
      <section className={`rise page-heading`} style={rise(0)}>
        <div>
          <h1>学习清单</h1>
          <p className="page-description">
            按录入顺序先进先出，每 {settings.listSize} 个词一组。
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/words" className={buttonClass({ variant: "ghost" })}>
            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
            添加单词
          </Link>
          {nextList && (
            <Link
              href={`/practice/?list=${nextList.index}`}
              className={buttonClass()}
            >
              开始下一组
              <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      <section
        className={`rise ${styles.toolbar}`}
        style={rise(1)}
        aria-label="清单概览与设置"
      >
        <div className={styles.overview}>
          <span>
            <strong>{lists.length}</strong> 份清单
          </span>
          <span className={styles.divider} aria-hidden="true" />
          <span>
            完成 <strong>{completedCount}</strong> 份
          </span>
          <span className={styles.progress}>
            <span className={`progress-rule ${styles.progressBar}`}>
              <span style={{ width: `${progress}%` }} />
            </span>
          </span>
        </div>
        <div className={styles.settings}>
          <ListSizeControl />
          <FeedbackModeControl />
        </div>
      </section>

      {words.length === 0 ? (
        <div className="empty-stage">
        <div className="empty-state">
          <span className="empty-state-icon">
            <Layers3 size={22} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h2>还没有可编排的单词</h2>
          <p>往词库里添加单词，学习清单就会自动出现。</p>
          <Link href="/words" className={buttonClass()}>
            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
            去添加单词
          </Link>
        </div>
        </div>
      ) : (
        <>
          <p className={styles.fifo}>
            改动每组数量会立即重新编排，编号也会随之变化。Anki
            里再按一次「重来」的词会被挪到队尾。
          </p>

          <div
            ref={rowsRef}
            className={`rise ${styles.rows}`}
            style={rise(2)}
            role="region"
            aria-label={`清单列表，第 ${pageData.page} 页`}
            tabIndex={-1}
          >
            {pageData.items.map((list) => (
              <ListRow
                key={list.signature}
                list={list}
                isNext={list.index === nextList?.index}
              />
            ))}
          </div>

          <div className={styles.footer}>
            <span className={styles.range} aria-live="polite">
              显示 {pageData.from}–{pageData.to} / 共 {lists.length} 份清单
            </span>

            <div className={styles.footerActions}>
              {nextPage !== null && nextPage !== pageData.page && (
                <button
                  type="button"
                  className={styles.nextHint}
                  onClick={() => goToPage(nextPage)}
                >
                  下一组在第 {nextPage} 页
                  <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              )}

              <Pager
                page={pageData.page}
                totalPages={pageData.totalPages}
                onChange={goToPage}
                label="清单分页"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
