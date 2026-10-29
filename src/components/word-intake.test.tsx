import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WordIntake } from "@/components/word-intake";
import { WIRE_PREFIX, encodeInboxPayload } from "@/lib/intake";
import { clearDatabase, ensureLoaded, getSnapshot } from "@/lib/store";

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

function envelope(
  entries: { term: string; meaning: string; capturedAt?: string }[],
): string {
  return `${WIRE_PREFIX}\n${encodeInboxPayload(entries)}`;
}

beforeEach(async () => {
  await ensureLoaded();
  clearDatabase();
});

describe("从 Anki 快速收录面板", () => {
  it("空内容时「收录」不可点", async () => {
    render(<WordIntake />);

    expect(await screen.findByLabelText("Anki 收录内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收录" })).toBeDisabled();
  });

  it("粘贴插件信封后入库，并给出汇总", async () => {
    render(<WordIntake />);

    const textarea = await screen.findByLabelText("Anki 收录内容");
    fireEvent.change(textarea, {
      target: { value: envelope([{ term: "lucid", meaning: "清晰易懂的" }]) },
    });
    await userEvent.click(screen.getByRole("button", { name: "收录" }));

    expect(await screen.findByText("已收录 1 个单词。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /去练习最后一组/ })).toBeInTheDocument();
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual(["lucid"]);
    expect(textarea).toHaveValue("");
  });

  it("重发同一个词（抓取时间没变）只报数，不重复入库", async () => {
    render(<WordIntake />);

    const capturedAt = "2024-05-01T09:00:00.000+00:00";
    const textarea = await screen.findByLabelText("Anki 收录内容");
    fireEvent.change(textarea, {
      target: {
        value: envelope([{ term: "lucid", meaning: "清晰易懂的", capturedAt }]),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "收录" }));
    await screen.findByText("已收录 1 个单词。");

    fireEvent.change(textarea, {
      target: {
        value: envelope([{ term: "lucid", meaning: "另一个释义", capturedAt }]),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "收录" }));

    expect(
      await screen.findByText("这 1 个单词都已在词库中，没有新增。"),
    ).toBeInTheDocument();
    expect(screen.getByText("已在词库中：lucid")).toBeInTheDocument();
    expect(getSnapshot()?.words).toHaveLength(1);
    expect(getSnapshot()?.words[0].meaning).toBe("清晰易懂的");
  });

  it("又忘一次（抓取时间更新）会把它排到队尾，并列出具体单词", async () => {
    render(<WordIntake />);

    const textarea = await screen.findByLabelText("Anki 收录内容");
    fireEvent.change(textarea, {
      target: {
        value: envelope([
          { term: "lucid", meaning: "清晰易懂的" },
          { term: "vivid", meaning: "生动的" },
        ]),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "收录" }));
    await screen.findByText("已收录 2 个单词。");

    fireEvent.change(textarea, {
      target: {
        value: envelope([
          {
            term: "lucid",
            meaning: "清晰易懂的",
            capturedAt: "2024-06-01T09:00:00.000+00:00",
          },
        ]),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "收录" }));

    expect(
      await screen.findByText("1 个单词重新排到了队尾。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("已排到队尾（最后一组会再练一次）：lucid"),
    ).toBeInTheDocument();
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual([
      "vivid",
      "lucid",
    ]);
  });

  it("手工粘贴的普通文本也能收录，坏行会报出来", async () => {
    render(<WordIntake />);

    const textarea = await screen.findByLabelText("Anki 收录内容");
    fireEvent.change(textarea, {
      target: { value: "candid\t坦率的\na broken line" },
    });
    await userEvent.click(screen.getByRole("button", { name: "收录" }));

    expect(
      await screen.findByText("已收录 1 个单词，1 条无法收录。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("无法收录：这一行缺少 Tab 分隔 ×1"),
    ).toBeInTheDocument();
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual(["candid"]);
  });
});
