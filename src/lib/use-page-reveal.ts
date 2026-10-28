"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { revealRegion } from "@/lib/reveal-region";

/**
 * 翻页后把区块重新露出，但只对「用户主动翻页」生效。
 *
 * 调用方在改 URL 之前先调用返回的 `requestReveal()`，等页码真正变化（新行已经渲染）
 * 后再滚动 + 聚焦。这样两种情况都不会被抢焦点：
 * - 深链打开 `/lists/?page=2`：没有请求，停在页面顶部；
 * - 单词库改搜索词把页码清掉：不是翻页，焦点继续留在搜索框。
 */
export function usePageReveal(
  page: number,
  elementRef: RefObject<HTMLElement | null>,
): () => void {
  const pending = useRef(false);

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    revealRegion(elementRef.current);
  }, [page, elementRef]);

  return useCallback(() => {
    pending.current = true;
  }, []);
}
