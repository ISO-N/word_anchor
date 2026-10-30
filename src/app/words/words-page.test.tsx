import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WordsPage from "@/app/words/page";
import { createEmptyDatabase, createWord, setListSize } from "@/lib/data";
import type { AppDatabase } from "@/lib/types";

const state = vi.hoisted(() => ({
  db: null as AppDatabase | null,
  query: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
  usePathname: () => "/words/",
  useSearchParams: () =>
    new URLSearchParams(state.query ? `q=${state.query}` : ""),
}));

vi.mock("@/lib/use-app-data", () => ({
  useAppData: () => state.db,
}));

function seed(wordCount: number): AppDatabase {
  let db = createEmptyDatabase();

  for (let index = 1; index <= wordCount; index += 1) {
    db = createWord(db, `word-${index}`, `释义 ${index}`);
  }

  return db;
}

function renderWords({ query = "" } = {}) {
  state.query = query;
  return render(<WordsPage />);
}

/** Next 的 Link 会归一化 href：源码里的 /practice/?list=1 渲染为 /practice?list=1 */
function practiceHref(listIndex: number) {
  return `/practice?list=${listIndex}&from=words`;
}

describe("单词库的清单入口", () => {
  beforeEach(() => {
    state.db = seed(12);
    state.query = "";
    state.replace.mockClear();
  });

  it("每行都链接到该词所在的清单", () => {
    renderWords();

    expect(
      screen.getByRole("columnheader", { name: "清单" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "LIST 01，含 word-1，进入连线练习" }),
    ).toHaveAttribute("href", practiceHref(1));
    expect(
      screen.getByRole("link", { name: "LIST 02，含 word-6，进入连线练习" }),
    ).toHaveAttribute("href", practiceHref(2));
    expect(
      screen.getByRole("link", { name: "LIST 03，含 word-12，进入连线练习" }),
    ).toHaveAttribute("href", practiceHref(3));
  });

  it("编号按全库位置计算，与搜索过滤无关", () => {
    renderWords({ query: "word-1" });

    const region = screen.getByRole("region", {
      name: "单词列表，第 1 页",
    });

    expect(
      within(region).getByRole("link", { name: /^LIST 01，含 word-1，/ }),
    ).toHaveAttribute("href", practiceHref(1));
    expect(
      within(region).getByRole("link", { name: /^LIST 02，含 word-10，/ }),
    ).toHaveAttribute("href", practiceHref(2));
    expect(
      within(region).getByRole("link", { name: /^LIST 03，含 word-11，/ }),
    ).toHaveAttribute("href", practiceHref(3));
  });

  it("修改每组单词数后编号随之变化", () => {
    state.db = setListSize(seed(12), 8);
    renderWords();

    expect(
      screen.getByRole("link", { name: "LIST 02，含 word-9，进入连线练习" }),
    ).toHaveAttribute("href", practiceHref(2));
  });

  it("词库为空时保持空态，没有清单链接", () => {
    state.db = createEmptyDatabase();
    renderWords();

    expect(
      screen.getByRole("heading", { name: "词库还是空的" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link", { name: /^LIST / })).toBeNull();
  });

  it("每一行都带着全部字段：窄屏只是换行，不丢列", () => {
    renderWords();

    const region = screen.getByRole("region", {
      name: "单词列表，第 1 页",
    });
    const row = within(region).getAllByRole("row")[1];

    /* 勾选 / 序号 / 单词 / 释义 / 复习 / 清单 / 加入时间 / 操作 */
    expect(within(row).getAllByRole("cell")).toHaveLength(8);
    expect(
      within(row).getByRole("checkbox", { name: "选择 word-1" }),
    ).toBeInTheDocument();
    expect(within(row).getByText("释义 1")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "编辑 word-1" })).toBeInTheDocument();
  });
});
