export const DEFAULT_PAGE_SIZE = 50;

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
