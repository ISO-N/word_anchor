import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePageReveal } from "@/lib/use-page-reveal";

function Harness({ page }: { page: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const requestReveal = usePageReveal(page, ref);

  return (
    <>
      <button type="button" onClick={requestReveal}>
        翻页
      </button>
      <div
        ref={ref}
        tabIndex={-1}
        data-testid="region"
        aria-label="清单列表"
      />
    </>
  );
}

function region() {
  return screen.getByTestId("region");
}

describe("usePageReveal", () => {
  it("首次渲染与深链打开都不抢焦点", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<Harness page={1} />);

    rerender(<Harness page={2} />);

    expect(scroll).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(region());
  });

  it("主动翻页后滚动并聚焦区块", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<Harness page={1} />);

    await user.click(screen.getByRole("button", { name: "翻页" }));
    rerender(<Harness page={2} />);

    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(document.activeElement).toBe(region());
  });

  it("搜索把页码清回第 1 页时不抢焦点", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<Harness page={3} />);

    rerender(<Harness page={1} />);

    expect(scroll).not.toHaveBeenCalled();
  });

  it("一次请求只触发一次", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<Harness page={1} />);

    await user.click(screen.getByRole("button", { name: "翻页" }));
    rerender(<Harness page={2} />);
    rerender(<Harness page={3} />);

    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
