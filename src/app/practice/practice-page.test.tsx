import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PracticePage from "@/app/practice/page";
import { createEmptyDatabase, createWord } from "@/lib/data";
import type { AppDatabase } from "@/lib/types";

const state = vi.hoisted(() => ({
  db: null as AppDatabase | null,
  search: "",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
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

function renderPractice(search: string) {
  state.search = search;
  return render(<PracticePage />);
}

describe("练习页的返回入口", () => {
  beforeEach(() => {
    state.db = seed(10);
    state.search = "";
  });

  it("从单词库进来时返回链接指向单词库", () => {
    renderPractice("list=2&from=words");

    const back = screen.getByRole("link", { name: "单词库" });
    expect(back).toHaveAttribute("href", "/words");
    expect(screen.queryByRole("link", { name: "学习清单" })).toBeNull();
  });

  it("默认返回学习清单", () => {
    renderPractice("list=2");

    const back = screen.getByRole("link", { name: "学习清单" });
    expect(back).toHaveAttribute("href", "/lists");
    expect(screen.queryByRole("link", { name: "单词库" })).toBeNull();
  });

  it("未知来源回落为学习清单", () => {
    renderPractice("list=2&from=elsewhere");

    expect(screen.getByRole("link", { name: "学习清单" })).toHaveAttribute(
      "href",
      "/lists",
    );
  });

  it("不存在的清单编号给出空态", () => {
    renderPractice("list=999&from=words");

    expect(
      screen.getByRole("heading", { name: "没有找到这份清单" }),
    ).toBeInTheDocument();
  });
});
