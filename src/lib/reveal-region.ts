/**
 * 翻页后的统一动作：把新的内容区块重新送进视野，并把焦点交给它。
 *
 * - 只滚到区块顶部：`html` 上的 `scroll-padding-top` 已经让出 sticky 页头的高度。
 * - 焦点落在 `role="region"` + `tabIndex={-1}` 的容器上，读屏会念出
 *   「清单列表，第 2 页」这类名字；键盘用户 Shift+Tab 一次即可回到页码条。
 * - `prefers-reduced-motion` 下改成瞬时滚动，避免长距离平滑位移。
 */
export function revealRegion(element: HTMLElement | null): void {
  if (!element) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  element.scrollIntoView({
    block: "start",
    behavior: reduced ? "auto" : "smooth",
  });
  element.focus({ preventScroll: true });
}
