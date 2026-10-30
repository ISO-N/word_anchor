import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { createEmptyDatabase, createWord, setListSize } from "@/lib/data";
import type { AppDatabase } from "@/lib/types";

const state = vi.hoisted(() => ({ db: null as AppDatabase | null }));

vi.mock("@/lib/use-app-data", () => ({ useAppData: () => state.db }));

function seed(wordCount: number): AppDatabase {
  let db = createEmptyDatabase();

  for (let index = 1; index <= wordCount; index += 1) {
    db = createWord(db, `word-${index}`, `释义 ${index}`);
  }

  return db;
}

describe("首页：首屏把行动放在前面", () => {
  beforeEach(() => {
    state.db = seed(12);
  });

  it("板面摆出下一份清单的词与待填的释义位", () => {
    const { container } = render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "把单词锚定在记忆里。",
    );

    const board = screen.getByRole("region", { name: /LIST 01/ });
    expect(within(board).getByText("word-1")).toBeInTheDocument();
    expect(within(board).getByText("第 1–5 个词 · 5 个词")).toBeInTheDocument();

    /* 每行的右列是一块不参与读屏的虚线留白，不是真实释义 */
    expect(container.querySelectorAll("li span[aria-hidden='true']")).toHaveLength(
      5,
    );
    expect(screen.queryByText("释义 1")).toBeNull();
  });

  it("首屏只有一个主按钮：同一个动作不出现两次", () => {
    const { container } = render(<HomePage />);

    expect(container.querySelectorAll(".button-primary")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /开始连线/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /添加单词/ })).toBeNull();
  });

  it("标题下面报的是完成进度，不是第二处重复的数量", () => {
    render(<HomePage />);

    expect(screen.getByText("完成 0 / 3 份清单")).toBeInTheDocument();
  });

  it("最近收录只给词、清单编号与日期，不提前露出释义", () => {
    render(<HomePage />);

    const recent = screen.getByRole("region", { name: "最近收录" });
    expect(within(recent).getByText("word-12")).toBeInTheDocument();
    expect(within(recent).queryByText("释义 12")).toBeNull();
  });

  it("空库时给的是第一步，不是一块空板面", () => {
    state.db = createEmptyDatabase();
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "从第一个单词开始" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "添加第一个单词" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("词库还空着，先记下第一个词。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /LIST/ })).toBeNull();
  });

  it("每组词数变了，板面的范围跟着重新编排", () => {
    state.db = setListSize(seed(12), 8);
    render(<HomePage />);

    expect(screen.getByText("第 1–8 个词 · 8 个词")).toBeInTheDocument();
  });
});
