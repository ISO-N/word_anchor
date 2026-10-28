/** 单词库每页条数 */
export const DEFAULT_PAGE_SIZE = 50;

/** 清单页每页份数：一行约 64px，10 行刚好是一屏的舒适长度 */
export const LIST_PAGE_SIZE = 10;

/** 页码窗口：当前页两侧各显示几个页码 */
export const PAGE_WINDOW_SIBLINGS = 1;

export type PageWindowItem = number | "gap";

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** 当前页第一条在全集里的序号（1 起）；空集为 0 */
  from: number;
  /** 当前页最后一条的序号；空集为 0 */
  to: number;
};

/**
 * 越界页码会被夹到最后一页而不是渲染空表，
 * 这样删词或改搜索词之后页码不会把用户丢进空页。
 */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
): Page<T> {
  const size = Math.max(1, Math.trunc(pageSize));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);

  return {
    items: slice,
    page: current,
    pageSize: size,
    total,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
  };
}

export function parsePageParam(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * 页码条要渲染的序列，例如 13 页里的第 5 页：
 * `[1, "gap", 4, 5, 6, "gap", 13]`
 *
 * 首尾页常驻、当前页左右各带 `siblings` 个邻居；
 * 只缺 1 页时补上数字（`1 … 3` 里的 2 没理由省掉），缺 2 页以上才折叠成 `"gap"`。
 */
export function pageWindow(
  page: number,
  totalPages: number,
  siblings = PAGE_WINDOW_SIBLINGS,
): PageWindowItem[] {
  const total = Math.max(1, Math.trunc(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), total);

  if (total <= 1) {
    return [1];
  }

  const span = Math.max(0, Math.trunc(siblings) || 0);
  const kept = new Set<number>([1, total, current]);

  for (let offset = 1; offset <= span; offset += 1) {
    if (current - offset >= 1) kept.add(current - offset);
    if (current + offset <= total) kept.add(current + offset);
  }

  const sorted = [...kept].sort((left, right) => left - right);
  const items: PageWindowItem[] = [];

  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];

    if (previous !== undefined) {
      const hole = value - previous - 1;
      if (hole === 1) items.push(previous + 1);
      else if (hole > 1) items.push("gap");
    }

    items.push(value);
  });

  return items;
}
