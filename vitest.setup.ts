import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * jsdom 缺少的浏览器 API：
 * - matchMedia：主题 auto 模式与 pointer 判定
 * - ResizeObserver：练习板的连线测量
 * - HTMLElement.inert：对话框的背景隔离
 * - scrollIntoView / scrollTo：聚焦与编辑面板
 */

let prefersDark = false;

export function setSystemPrefersDark(value: boolean): void {
  prefersDark = value;
}

beforeEach(() => {
  prefersDark = false;
  window.localStorage.clear();

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-color-scheme: dark") ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  if (!("inert" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "inert", {
      configurable: true,
      get() {
        return this.hasAttribute("inert");
      },
      set(value: boolean) {
        if (value) this.setAttribute("inert", "");
        else this.removeAttribute("inert");
      },
    });
  }

  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});
