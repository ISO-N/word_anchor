import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@/lib/desktop";
import { encodeIntakeBody } from "@/lib/intake";
import { clearDatabase, ensureLoaded, getSnapshot } from "@/lib/store";
import { AnkiIntake } from "@/components/anki-intake";

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

const desktop = vi.hoisted(() => ({
  tauri: true,
  inbox: [] as InboxItem[],
  removed: [] as string[],
  listeners: [] as ((path: string) => void)[],
}));

vi.mock("@/lib/desktop", () => ({
  isTauri: () => desktop.tauri,
  listInbox: vi.fn(async () => desktop.inbox.map((item) => ({ ...item }))),
  removeInboxFile: vi.fn(async (path: string) => {
    desktop.removed.push(path);
    desktop.inbox = desktop.inbox.filter((item) => item.path !== path);
  }),
  onIntake: vi.fn(async (listener: (path: string) => void) => {
    desktop.listeners.push(listener);
    return () => {
      desktop.listeners = desktop.listeners.filter((entry) => entry !== listener);
    };
  }),
}));

function enqueue(path: string, payload: string): void {
  desktop.inbox.push({ path, payload });
}

function fireIntake(): void {
  act(() => {
    desktop.listeners.forEach((listener) => listener("C:/word-anchor/inbox/latest.json"));
  });
}

beforeEach(async () => {
  desktop.tauri = true;
  desktop.inbox = [];
  desktop.removed = [];
  desktop.listeners = [];
  await ensureLoaded();
  clearDatabase();
});

describe("收件箱收录", () => {
  it("启动时补收收件箱里剩下的 payload，并删掉文件", async () => {
    enqueue(
      "C:/word-anchor/inbox/01.json",
      encodeIntakeBody([{ term: "harbinger", meaning: "预兆" }]),
    );

    render(<AnkiIntake />);

    expect(await screen.findByText("已收录 1 个单词。")).toBeInTheDocument();
    expect(desktop.removed).toEqual(["C:/word-anchor/inbox/01.json"]);
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual(["harbinger"]);
    expect(
      screen.getByRole("link", { name: /去练习最后一组/ }),
    ).toHaveAttribute("href", "/practice/?list=1");
  });

  it("收到 anki:intake 事件后立刻收录", async () => {
    render(<AnkiIntake />);
    expect(desktop.listeners).toHaveLength(1);

    enqueue(
      "C:/word-anchor/inbox/02.json",
      encodeIntakeBody([{ term: "quaint", meaning: "古雅的" }]),
    );
    fireIntake();

    expect(await screen.findByText("已收录 1 个单词。")).toBeInTheDocument();
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual(["quaint"]);
  });

  it("同一条 payload 出现两次只入库一次，第二次只报重复", async () => {
    const payload = encodeIntakeBody([
      {
        term: "lucid",
        meaning: "清晰易懂的",
        capturedAt: "2024-05-01T09:00:00.000+00:00",
      },
    ]);
    enqueue("C:/word-anchor/inbox/03.json", payload);
    enqueue("C:/word-anchor/inbox/04.json", payload);

    render(<AnkiIntake />);

    expect(
      await screen.findByText("已收录 1 个单词，跳过 1 个已在词库中。"),
    ).toBeInTheDocument();
    expect(getSnapshot()?.words).toHaveLength(1);
    expect(desktop.removed).toHaveLength(2);
  });

  it("新的一次抓取把已收录的词挪到队尾", async () => {
    enqueue(
      "C:/word-anchor/inbox/05.json",
      encodeIntakeBody([
        { term: "lucid", meaning: "清晰易懂的" },
        { term: "vivid", meaning: "生动的" },
      ]),
    );

    render(<AnkiIntake />);
    await screen.findByText("已收录 2 个单词。");

    enqueue(
      "C:/word-anchor/inbox/06.json",
      encodeIntakeBody([
        {
          term: "lucid",
          meaning: "清晰易懂的",
          capturedAt: "2024-06-01T09:00:00.000+00:00",
        },
      ]),
    );
    fireIntake();

    expect(
      await screen.findByText(/1 个单词重新排到了队尾/),
    ).toBeInTheDocument();
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual([
      "vivid",
      "lucid",
    ]);
  });

  it("坏 payload 报可读的错误，也不会把收件箱卡死", async () => {
    enqueue("C:/word-anchor/inbox/07.json", "!!!!");

    render(<AnkiIntake />);

    expect(await screen.findByText(/收录失败/)).toBeInTheDocument();
    expect(screen.getByText(/收录内容无法解码/)).toBeInTheDocument();
    expect(desktop.removed).toEqual(["C:/word-anchor/inbox/07.json"]);
    expect(getSnapshot()?.words).toHaveLength(0);
  });

  it("收件箱为空时什么都不渲染", async () => {
    const { container } = render(<AnkiIntake />);

    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("浏览器预览里不订阅事件、也不读收件箱", async () => {
    desktop.tauri = false;

    render(<AnkiIntake />);
    await act(async () => {});

    expect(desktop.listeners).toHaveLength(0);
    expect(desktop.removed).toHaveLength(0);
  });
});
