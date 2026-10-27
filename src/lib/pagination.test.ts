import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, paginate, parsePageParam } from "@/lib/pagination";

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

describe("paginate", () => {
  it("每页 50 条时 1000 条分成 20 页", () => {
    const page = paginate(range(1000), 1);

    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(page.totalPages).toBe(20);
    expect(page.items).toHaveLength(50);
    expect(page.from).toBe(1);
    expect(page.to).toBe(50);
  });

  it("最后一页只含剩余条目", () => {
    const page = paginate(range(1000), 20);

    expect(page.items).toHaveLength(50);
    expect(page.from).toBe(951);
    expect(page.to).toBe(1000);
    expect(page.items[49]).toBe(1000);
  });

  it("越界页码夹到最后一页而不是渲染空表", () => {
    const page = paginate(range(120), 99);

    expect(page.page).toBe(3);
    expect(page.from).toBe(101);
    expect(page.to).toBe(120);
  });

  it("非法页码归一到第 1 页", () => {
    expect(paginate(range(10), 0).page).toBe(1);
    expect(paginate(range(10), -4).page).toBe(1);
    expect(paginate(range(10), Number.NaN).page).toBe(1);
  });

  it("空集仍然有 1 页且没有条目", () => {
    const page = paginate([], 3);

    expect(page.totalPages).toBe(1);
    expect(page.page).toBe(1);
    expect(page.items).toEqual([]);
    expect(page.from).toBe(0);
    expect(page.to).toBe(0);
  });

  it("自定义每页条数", () => {
    const page = paginate(range(25), 2, 10);

    expect(page.totalPages).toBe(3);
    expect(page.from).toBe(11);
    expect(page.to).toBe(20);
  });
});

describe("parsePageParam", () => {
  it("接受正整数", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(" 12 ")).toBe(12);
  });

  it("拒绝空值、负数与垃圾输入", () => {
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
  });
});
