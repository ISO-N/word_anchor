import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReviewPage from "@/app/review/page";
import { createEmptyDatabase, createWord } from "@/lib/data";
import type { AppDatabase } from "@/lib/types";

const state = vi.hoisted(() => ({ db: null as AppDatabase | null }));

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

describe("趣味复习页", () => {
  beforeEach(() => {
    state.db = seed(5);
  });

  it("还没有数据时给出占位而不是报错", () => {
    state.db = null;

    render(<ReviewPage />);

    expect(screen.getByText("正在准备复习…")).toBeInTheDocument();
  });

  it("空词库引导去添加单词", () => {
    state.db = seed(0);

    render(<ReviewPage />);

    expect(
      screen.getByRole("heading", { name: "词库还是空的" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /去添加单词/ })).toHaveAttribute(
      "href",
      "/words",
    );
  });

  it("只有一个词时提示至少需要两个", () => {
    state.db = seed(1);

    render(<ReviewPage />);

    expect(
      screen.getByRole("heading", { name: "再添一个词就能开始" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回清单" })).toHaveAttribute(
      "href",
      "/lists",
    );
  });

  it("两个词就能开始，题数按词库规模缩短", () => {
    state.db = seed(2);

    render(<ReviewPage />);

    expect(screen.getByText("第 1 / 4 题")).toBeInTheDocument();
  });

  it("词库足够时按 10 题开局", () => {
    render(<ReviewPage />);

    expect(screen.getByText("第 1 / 10 题")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /单词库/ })).toHaveAttribute(
      "href",
      "/words",
    );
  });
});
