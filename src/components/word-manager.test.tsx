import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WordManager } from "@/components/word-manager";
import type { WordRecord } from "@/lib/types";

const store = vi.hoisted(() => ({
  addWord: vi.fn(),
  editWord: vi.fn(),
  removeWord: vi.fn(),
  removeWords: vi.fn(),
}));

vi.mock("@/lib/store", () => store);

const router = { replace: vi.fn() };
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/words/",
  useSearchParams: () => searchParams,
}));

/* App Router 的 Link 需要路由上下文，组件测试里退化成普通 <a> */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: unknown;
    children: React.ReactNode;
  }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

function makeWords(count: number): WordRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    term: `word-${index + 1}`,
    meaning: `释义 ${index + 1}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
  }));
}

/** 覆盖全局桩：模拟精确指针（桌面）或粗指针（触屏） */
function stubPointer(fine: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: fine && query.includes("(pointer: fine)"),
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

function renderManager(words: WordRecord[] = makeWords(12)) {
  return render(
    <main id="main-content">
      <WordManager words={words} listIndexByWordId={new Map()} />
    </main>,
  );
}

beforeEach(() => {
  store.addWord.mockReset();
  store.editWord.mockReset();
  store.removeWord.mockReset();
  store.removeWords.mockReset();
  router.replace.mockReset();
  [...searchParams.keys()].forEach((key) => searchParams.delete(key));});

describe("单词的新增与编辑对话框", () => {
  it("新增打开居中对话框，字段在窗口里，页面不滚动", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "添加单词" }));

    const dialog = screen.getByRole("dialog", { name: "记下一个新词" });
    expect(within(dialog).getByLabelText("单词")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("释义")).toBeInTheDocument();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("提交新增后写库、关闭对话框，焦点回到触发按钮", async () => {
    const user = userEvent.setup();
    renderManager();

    const trigger = screen.getByRole("button", { name: "添加单词" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "记下一个新词" });
    await user.type(within(dialog).getByLabelText("单词"), "lucid");
    await user.type(within(dialog).getByLabelText("释义"), "清晰易懂的");
    await user.click(within(dialog).getByRole("button", { name: "加入词库" }));

    expect(store.addWord).toHaveBeenCalledWith("lucid", "清晰易懂的");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("编辑最后一行：预填内容、页面不滚回顶部，桌面指针聚焦单词", async () => {
    stubPointer(true);
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "编辑 word-12" }));

    const dialog = screen.getByRole("dialog", { name: "调整这个词" });
    expect(within(dialog).getByLabelText("单词")).toHaveValue("word-12");
    expect(within(dialog).getByLabelText("释义")).toHaveValue("释义 12");
    expect(window.scrollTo).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(within(dialog).getByLabelText("单词")).toHaveFocus(),
    );
  });

  it("触屏打开时不把焦点送进输入框", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "添加单词" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "取消" })).toHaveFocus(),
    );
  });

  it("保存修改后关闭对话框，焦点回到行内铅笔按钮", async () => {
    const user = userEvent.setup();
    renderManager();

    const rowButton = screen.getByRole("button", { name: "编辑 word-2" });
    await user.click(rowButton);

    const dialog = screen.getByRole("dialog", { name: "调整这个词" });
    const term = within(dialog).getByLabelText("单词");
    await user.clear(term);
    await user.type(term, "revised");
    await user.click(within(dialog).getByRole("button", { name: "保存修改" }));

    expect(store.editWord).toHaveBeenCalledWith(2, "revised", "释义 2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(rowButton).toHaveFocus());
  });

  it("空提交时两个字段都报错，焦点落在第一个错误字段", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "添加单词" }));
    await user.click(screen.getByRole("button", { name: "加入词库" }));

    expect(
      screen.getByText("请输入单词，例如 serendipity。"),
    ).toBeInTheDocument();
    expect(screen.getByText("请输入释义。")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(store.addWord).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("单词")).toHaveFocus(),
    );
  });

  it("重复单词报在「单词」字段，对话框保持打开", async () => {
    store.editWord.mockImplementationOnce(() => {
      throw new Error("这个单词已经在词库中了");
    });

    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "编辑 word-1" }));

    const dialog = screen.getByRole("dialog", { name: "调整这个词" });
    const term = within(dialog).getByLabelText("单词");
    await user.clear(term);
    await user.type(term, "word-2");
    await user.click(within(dialog).getByRole("button", { name: "保存修改" }));

    expect(screen.getByText("这个单词已经在词库中了。")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("单词")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("单词")).toHaveFocus(),
    );
  });

  it("Esc 关闭对话框，丢弃未保存的输入", async () => {
    const user = userEvent.setup();
    renderManager();

    const trigger = screen.getByRole("button", { name: "添加单词" });
    await user.click(trigger);
    await user.type(screen.getByLabelText("单词"), "temp");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.addWord).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("对话框打开时背景被 inert 隔离，关闭后恢复", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "添加单词" }));
    expect(document.querySelector("#main-content")).toHaveProperty(
      "inert",
      true,
    );

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(document.querySelector("#main-content")).toHaveProperty(
        "inert",
        false,
      ),
    );
  });
});

describe("单词的批量删除", () => {
  it("每行一个勾选框，列头可全选本页也可取消", async () => {
    const user = userEvent.setup();
    renderManager();

    expect(
      screen.getByRole("checkbox", { name: "选择 word-1" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-12" }),
    ).toBeInTheDocument();

    const selectAll = screen.getByRole("checkbox", {
      name: "选中本页全部单词",
    });
    await user.click(selectAll);

    expect(screen.getAllByRole("checkbox")).toHaveLength(13);
    expect(selectAll).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-12" }),
    ).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("已选 12 个词");

    await user.click(selectAll);

    expect(selectAll).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-1" }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole("group", { name: "批量删除" }),
    ).not.toBeInTheDocument();
  });

  it("部分选中时列头是半选态", async () => {
    const user = userEvent.setup();
    renderManager();

    const selectAll = screen.getByRole("checkbox", {
      name: "选中本页全部单词",
    }) as HTMLInputElement;

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));

    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll).not.toBeChecked();
  });

  it("选中两个词后确认，一次删掉并给出提示", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 word-3" }));

    expect(screen.getByRole("status")).toHaveTextContent("已选 2 个词");

    await user.click(screen.getByRole("button", { name: "删除选中" }));

    const dialog = screen.getByRole("dialog", {
      name: "删除选中的 2 个单词？",
    });
    expect(dialog).toHaveTextContent("之后的学习清单会重新编排");
    expect(dialog).toHaveTextContent("word-1、word-3");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "再想想" }),
      ).toHaveFocus(),
    );

    await user.click(
      within(dialog).getByRole("button", { name: "删除 2 个词" }),
    );

    expect(store.removeWords).toHaveBeenCalledWith([1, 3]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "批量删除" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("已删除 2 个单词。")).toBeInTheDocument();
  });

  it("翻页后选中不丢，并提示有多少个不在当前页", async () => {
    const user = userEvent.setup();
    const words = makeWords(60);
    const { rerender } = renderManager(words);

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));

    /* 真实环境里翻页是 router.replace → 新 searchParams；这里直接换页码重渲染 */
    searchParams.set("page", "2");
    rerender(
      <main id="main-content">
        <WordManager words={words} listIndexByWordId={new Map()} />
      </main>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("已选 1 个词");
    expect(screen.getByRole("status")).toHaveTextContent(
      "（1 个不在当前页或搜索结果中）",
    );
    expect(
      screen.queryByRole("checkbox", { name: "选择 word-1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-51" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "选中全部 60 个单词" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("已选 60 个词");
    expect(screen.getByRole("status")).toHaveTextContent(
      "（50 个不在当前页或搜索结果中）",
    );
  });

  it("选中项被搜索排除时也计入总数，并给出提示", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));
    await user.type(screen.getByLabelText("搜索单词或释义"), "word-2");

    expect(screen.getByRole("status")).toHaveTextContent("已选 1 个词");
    expect(screen.getByRole("status")).toHaveTextContent(
      "（1 个不在当前页或搜索结果中）",
    );
    expect(
      screen.queryByRole("checkbox", { name: "选择 word-1" }),
    ).not.toBeInTheDocument();
  });

  it("搜索时「选中全部」只覆盖筛选结果", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("搜索单词或释义"), "word-1");
    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));
    await user.click(
      screen.getByRole("button", { name: "选中全部 4 个单词" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("已选 4 个词");
    expect(screen.getByRole("status")).not.toHaveTextContent("不在当前页");
  });

  it("取消或 Esc 不删除，选中保留", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("checkbox", { name: "选择 word-2" }));
    await user.click(screen.getByRole("button", { name: "删除选中" }));

    const dialog = screen.getByRole("dialog", {
      name: "删除选中的 1 个单词？",
    });
    await user.click(within(dialog).getByRole("button", { name: "再想想" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.removeWords).not.toHaveBeenCalled();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-2" }),
    ).toBeChecked();

    await user.click(screen.getByRole("button", { name: "删除选中" }));
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.removeWords).not.toHaveBeenCalled();
  });

  it("清空选择后操作条消失", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 word-2" }));
    await user.click(screen.getByRole("button", { name: "清空选择" }));

    expect(
      screen.queryByRole("group", { name: "批量删除" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-1" }),
    ).not.toBeChecked();
  });

  it("删除失败时对话框保持打开并报错", async () => {
    store.removeWords.mockImplementationOnce(() => {
      throw new Error("本地词库还在加载，请稍后再试");
    });

    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));
    await user.click(screen.getByRole("button", { name: "删除选中" }));
    await user.click(screen.getByRole("button", { name: "删除 1 个词" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "本地词库还在加载，请稍后再试",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "选择 word-1" }),
    ).toBeChecked();
  });

  it("词库在别处被删空时，选中状态跟着消失", async () => {
    const user = userEvent.setup();
    const words = makeWords(3);
    const { rerender } = renderManager(words);

    await user.click(screen.getByRole("checkbox", { name: "选择 word-1" }));
    expect(
      screen.getByRole("group", { name: "批量删除" }),
    ).toBeInTheDocument();

    rerender(
      <main id="main-content">
        <WordManager words={[]} listIndexByWordId={new Map()} />
      </main>,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "批量删除" }),
      ).not.toBeInTheDocument(),
    );
  });
});
