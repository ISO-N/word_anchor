import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WordManager } from "@/components/word-manager";
import type { WordRecord } from "@/lib/types";

const store = vi.hoisted(() => ({
  addWord: vi.fn(),
  editWord: vi.fn(),
  removeWord: vi.fn(),
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

function renderManager() {
  return render(
    <main id="main-content">
      <WordManager words={makeWords(12)} listIndexByWordId={new Map()} />
    </main>,
  );
}

beforeEach(() => {
  store.addWord.mockReset();
  store.editWord.mockReset();
  store.removeWord.mockReset();
  router.replace.mockReset();
});

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
