import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pager } from "@/components/ui/pager";

function renderPager(page: number, totalPages: number) {
  const onChange = vi.fn();
  render(<Pager page={page} totalPages={totalPages} onChange={onChange} label="清单分页" />);
  return { onChange };
}

describe("Pager", () => {
  it("只有一页时整条不渲染", () => {
    const { container } = render(
      <Pager page={1} totalPages={1} onChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("中间页渲染首尾、邻居与折叠号", () => {
    renderPager(5, 13);

    expect(screen.getByRole("navigation", { name: "清单分页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 1 页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 4 页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 6 页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 13 页" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "第 3 页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "第 7 页" })).not.toBeInTheDocument();

    const gaps = screen.getAllByText("…");
    expect(gaps).toHaveLength(2);
    gaps.forEach((gap) => expect(gap).toHaveAttribute("aria-hidden", "true"));
  });

  it("当前页带 aria-current，其余没有", () => {
    renderPager(5, 13);

    expect(screen.getByRole("button", { name: "第 5 页" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "第 4 页" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("点页码回传目标页", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPager(5, 13);

    await user.click(screen.getByRole("button", { name: "第 6 页" }));
    await user.click(screen.getByRole("button", { name: "第 13 页" }));

    expect(onChange).toHaveBeenNthCalledWith(1, 6);
    expect(onChange).toHaveBeenNthCalledWith(2, 13);
  });

  it("上一页 / 下一页在两端禁用", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPager(1, 13);

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("末页禁用下一页", () => {
    renderPager(13, 13);

    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
  });

  it("越界页码按夹取后的结果渲染", () => {
    renderPager(99, 13);

    expect(screen.getByRole("button", { name: "第 13 页" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
