import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ListsPage from "@/app/lists/page";
import { createEmptyDatabase, createWord, setListSize } from "@/lib/data";
import type { AppDatabase } from "@/lib/types";

const state = vi.hoisted(() => ({
  db: null as AppDatabase | null,
  page: null as string | null,
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
  usePathname: () => "/lists/",
  useSearchParams: () =>
    new URLSearchParams(state.page === null ? "" : `page=${state.page}`),
}));

vi.mock("@/lib/use-app-data", () => ({
  useAppData: () => state.db,
}));

/** 1000 词 / 每组 8 个 = 125 份清单，正好验证多页与末页余数 */
function seed(wordCount: number, listSize = 8): AppDatabase {
  let db = createEmptyDatabase();
  db = setListSize(db, listSize);

  for (let index = 0; index < wordCount; index += 1) {
    db = createWord(db, `word-${index + 1}`, `释义 ${index + 1}`);
  }

  return db;
}

function renderLists({ page = null as string | null } = {}) {
  state.page = page;
  return render(<ListsPage />);
}

describe("清单页分页", () => {
  beforeEach(() => {
    state.db = seed(1000);
    state.page = null;
    state.replace.mockClear();
  });

  it("默认显示第 1 页的 10 份清单", () => {
    renderLists();

    const region = screen.getByRole("region", { name: "清单列表，第 1 页" });
    expect(within(region).getAllByRole("link")).toHaveLength(10);
    expect(within(region).getByRole("link", { name: /^清单 1，/ })).toBeInTheDocument();
    expect(within(region).queryByRole("link", { name: /^清单 11，/ })).toBeNull();
    expect(screen.getByText(/显示 1–10 \/ 共 125 份清单/)).toBeInTheDocument();
  });

  it("?page=2 直接落在第 11–20 份清单", () => {
    renderLists({ page: "2" });

    const region = screen.getByRole("region", { name: "清单列表，第 2 页" });
    expect(within(region).getByRole("link", { name: /^清单 11，/ })).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /^清单 20，/ })).toBeInTheDocument();
    expect(screen.getByText(/显示 11–20 \/ 共 125 份清单/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 2 页" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("点下一页把页码写进 URL", async () => {
    const user = userEvent.setup();
    renderLists({ page: "2" });

    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(state.replace).toHaveBeenCalledWith("/lists/?page=3", { scroll: false });
  });

  it("点页码直达目标页", async () => {
    const user = userEvent.setup();
    renderLists({ page: "2" });

    await user.click(screen.getByRole("button", { name: "第 13 页" }));

    expect(state.replace).toHaveBeenCalledWith("/lists/?page=13", { scroll: false });
  });

  it("点当前页不发请求", async () => {
    const user = userEvent.setup();
    renderLists({ page: "2" });

    await user.click(screen.getByRole("button", { name: "第 2 页" }));

    expect(state.replace).not.toHaveBeenCalled();
  });

  it("下一组不在当前页时给出跳页提示", async () => {
    const user = userEvent.setup();
    renderLists({ page: "2" });

    await user.click(screen.getByRole("button", { name: /下一组在第 1 页/ }));

    expect(state.replace).toHaveBeenCalledWith("/lists/", { scroll: false });
  });

  it("清单不足一页时没有页码条，只有范围文字", () => {
    state.db = seed(60);
    renderLists();

    expect(screen.queryByRole("navigation", { name: "清单分页" })).toBeNull();
    expect(screen.getByText(/显示 1–8 \/ 共 8 份清单/)).toBeInTheDocument();
  });

  it("越界页码夹到末页", () => {
    renderLists({ page: "99" });

    expect(screen.getByRole("region", { name: "清单列表，第 13 页" })).toBeInTheDocument();
    expect(screen.getByText(/显示 121–125 \/ 共 125 份清单/)).toBeInTheDocument();
  });

  it("词库为空时保持空态，不出现页脚", () => {
    state.db = createEmptyDatabase();
    renderLists();

    expect(screen.getByRole("heading", { name: "还没有可编排的单词" })).toBeInTheDocument();
    expect(screen.queryByText(/显示 \d/)).toBeNull();
    expect(screen.queryByRole("navigation", { name: "清单分页" })).toBeNull();
  });
});
