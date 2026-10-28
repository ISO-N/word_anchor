import { describe, expect, it, vi } from "vitest";
import { revealRegion } from "@/lib/reveal-region";

function createRegion() {
  const region = document.createElement("div");
  region.tabIndex = -1;
  region.setAttribute("role", "region");
  region.setAttribute("aria-label", "清单列表，第 2 页");
  document.body.append(region);

  const scrollIntoView = vi.fn();
  region.scrollIntoView = scrollIntoView;

  return { region, scrollIntoView };
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("revealRegion", () => {
  it("没有节点时静默返回", () => {
    expect(() => revealRegion(null)).not.toThrow();
  });

  it("滚动到区块顶部并把焦点移进区块", () => {
    const { region, scrollIntoView } = createRegion();

    revealRegion(region);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(document.activeElement).toBe(region);

    region.remove();
  });

  it("prefers-reduced-motion 下瞬时滚动", () => {
    stubReducedMotion(true);
    const { region, scrollIntoView } = createRegion();

    revealRegion(region);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });

    region.remove();
  });
});
