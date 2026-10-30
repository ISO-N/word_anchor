export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 两位数编号：清单编号与词序共用。
 *
 * 它是队列里的位置（`LIST 03` 会出现在 URL、可读名称与清单页上），
 * 不是给版式凑数的装饰序号，所以这里保留补零。
 */
export function formatIndex(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(2, "0"); // taste-skill-ignore
}

/** `LIST 03`：全站唯一的清单标签写法 */
export function formatListLabel(index: number): string {
  return `LIST ${formatIndex(index)}`;
}
