/**
 * 运行环境探测。
 *
 * 桌面端与浏览器预览（`pnpm dev` / jsdom 单测）共用同一份前端代码，
 * 唯一需要区分的地方就是「有没有 Tauri 运行时」。单独成文件是为了让
 * store 这类底层模块不必 import 整个 desktop 抽象（也就不会被测试里的
 * `vi.mock("@/lib/desktop")` 误伤）。
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 桌面端且已经拿到端口时才有意义 */
export function apiBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
