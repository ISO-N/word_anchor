import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  LIST_PAGE_SIZE,
  pageWindow,
  paginate,
  parsePageParam,
} from "@/lib/pagination";

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

describe("清单分页", () => {
  it("每页 10 份，125 份清单分成 13 页", () => {
    const page = paginate(range(125), 13, LIST_PAGE_SIZE);

    expect(LIST_PAGE_SIZE).toBe(10);
    expect(page.totalPages).toBe(13);
    expect(page.items).toHaveLength(5);
    expect(page.from).toBe(121);
    expect(page.to).toBe(125);
  });

  it("第 2 页拿到第 11–20 份", () => {
    const page = paginate(range(125), 2, LIST_PAGE_SIZE);

    expect(page.items[0]).toBe(11);
    expect(page.items[9]).toBe(20);
    expect(page.from).toBe(11);
    expect(page.to).toBe(20);
  });

  it("越界页码夹到末页", () => {
    const page = paginate(range(125), 99, LIST_PAGE_SIZE);

    expect(page.page).toBe(13);
    expect(page.from).toBe(121);
  });
});

describe("pageWindow", () => {
  it("只有 1 页时只返回首页", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(7, 1)).toEqual([1]);
  });

  it("第 1 页：开头几个页码 + 末页", () => {
    expect(pageWindow(1, 13)).toEqual([1, 2, "gap", 13]);
  });

  it("中间页：首尾常驻，两侧各留 1 个邻居", () => {
    expect(pageWindow(5, 13)).toEqual([1, "gap", 4, 5, 6, "gap", 13]);
  });

  it("末页：开头折叠", () => {
    expect(pageWindow(13, 13)).toEqual([1, "gap", 12, 13]);
    expect(pageWindow(99, 13)).toEqual([1, "gap", 12, 13]);
  });

  it("只缺 1 页时补上数字，不折叠", () => {
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, "gap", 8]);
    expect(pageWindow(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("非法页码归一到第 1 页", () => {
    expect(pageWindow(0, 13)).toEqual(pageWindow(1, 13));
    expect(pageWindow(Number.NaN, 13)).toEqual(pageWindow(1, 13));
  });

  it("siblings 可调，为 0 时只有首尾与当前页", () => {
    expect(pageWindow(5, 13, 0)).toEqual([1, "gap", 5, "gap", 13]);
    expect(pageWindow(5, 13, 2)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      "gap",
      13,
    ]);
  });
});
