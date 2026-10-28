"use client";

import { pageWindow } from "@/lib/pagination";
import styles from "./pager.module.css";

type PagerProps = {
  /** 当前页：调用方应传入 `paginate()` 夹取后的页码 */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** 导航区的可访问名称，例如「清单分页」 */
  label?: string;
};

/**
 * 两个列表页共用的页码条：上一页 / 页码直达（首尾常驻、中段折叠）/ 下一页。
 *
 * 只负责呈现与回调，不碰 URL，也不播报：范围文字由页脚的 `aria-live` 负责，
 * 避免同一个变化被读屏念两遍。
 */
export function Pager({ page, totalPages, onChange, label = "分页" }: PagerProps) {
  const total = Math.max(1, Math.trunc(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), total);

  if (total <= 1) {
    return null;
  }

  return (
    <nav className={styles.pager} aria-label={label}>
      <button
        type="button"
        className={styles.step}
        onClick={() => onChange(current - 1)}
        disabled={current <= 1}
      >
        上一页
      </button>

      {pageWindow(current, total).map((item, index) =>
        item === "gap" ? (
          <span
            key={`gap-${index}`}
            className={styles.gap}
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={[styles.page, item === current ? styles.current : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(item)}
            aria-label={`第 ${item} 页`}
            aria-current={item === current ? "page" : undefined}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className={styles.step}
        onClick={() => onChange(current + 1)}
        disabled={current >= total}
      >
        下一页
      </button>
    </nav>
  );
}
