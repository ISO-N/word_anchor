import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeSession } from "@/components/practice-session";
import type { FeedbackMode, WordRecord } from "@/lib/types";

const { markListComplete } = vi.hoisted(() => ({ markListComplete: vi.fn() }));

vi.mock("@/lib/store", () => ({
  markListComplete,
  subscribe: () => () => undefined,
  getSnapshot: () => null,
  getPersistError: () => null,
  ensureLoaded: () => Promise.resolve(),
  updateFeedbackMode: vi.fn(),
}));

const WORDS: WordRecord[] = [
  {
    id: 1,
    term: "serendipity",
    meaning: "意外的好运",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: 2,
    term: "lucid",
    meaning: "清晰易懂的",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];

/* 五个词：默认清单大小，也是「至少一行对位」最容易发生的规模 */
const BOARD_WORDS: WordRecord[] = [
  "serendipity",
  "lucid",
  "anchor",
  "ephemeral",
  "tacit",
].map((term, index) => ({
  id: index + 1,
  term,
  meaning: `释义 ${index + 1}`,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
}));

function session(feedbackMode: FeedbackMode, words: WordRecord[] = WORDS) {
  return (
    <PracticeSession
      listIndex={1}
      words={words}
      isPartial={false}
      alreadyCompleted={false}
      nextIndex={null}
      feedbackMode={feedbackMode}
      origin="lists"
    />
  );
}

function card(name: string) {
  return screen.getByRole("button", { name });
}

/** 按 DOM 顺序读出某一列的单词 id：正文顺序就是排布结果 */
function columnIds(side: "term" | "meaning") {
  return Array.from(
    document.querySelectorAll(`[data-node-side="${side}"]`),
  ).map((node) => (node as HTMLElement).dataset.nodeId ?? "");
}

async function connect(
  user: ReturnType<typeof userEvent.setup>,
  term: string,
  meaning: string,
) {
  await user.click(card(`${term}，尚未连接`));
  await user.click(card(`${meaning}，尚未连接`));
}

describe("练习反馈方式", () => {
  beforeEach(() => {
    markListComplete.mockClear();
  });

  it("手动判定：连线不暴露对错，连满前不能判定", async () => {
    const user = userEvent.setup();
    render(session("manual"));

    const judge = screen.getByRole("button", { name: "判定" });
    expect(judge).toBeDisabled();

    await connect(user, "serendipity", "意外的好运");

    expect(card("serendipity，已连接，待判定")).toBeInTheDocument();
    expect(card("意外的好运，已连接，待判定")).toBeInTheDocument();
    expect(judge).toBeDisabled();

    await connect(user, "lucid", "清晰易懂的");
    expect(judge).toBeEnabled();
  });

  it("手动判定：全对后再判定才收束并记录", async () => {
    const user = userEvent.setup();
    render(session("manual"));

    await connect(user, "serendipity", "意外的好运");
    await connect(user, "lucid", "清晰易懂的");
    await user.click(screen.getByRole("button", { name: "判定" }));

    expect(card("serendipity，已正确连接")).toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(markListComplete).toHaveBeenCalledWith(1, 2, 0);
  });

  it("手动判定：判错后保留连线，改对再判定", async () => {
    const user = userEvent.setup();
    render(session("manual"));

    await connect(user, "serendipity", "清晰易懂的");
    await connect(user, "lucid", "意外的好运");
    await user.click(screen.getByRole("button", { name: "判定" }));

    expect(card("serendipity，连接错误")).toBeInTheDocument();
    expect(card("lucid，连接错误")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    /* 同一组连线不能重复判定，避免重复计错 */
    expect(screen.getByRole("button", { name: "判定" })).toBeDisabled();

    await user.click(card("serendipity，连接错误"));
    await user.click(card("意外的好运，连接错误"));
    expect(card("serendipity，已连接，待判定")).toBeInTheDocument();
    await connect(user, "lucid", "清晰易懂的");
    await user.click(screen.getByRole("button", { name: "判定" }));

    expect(
      await screen.findByRole("dialog", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(markListComplete).toHaveBeenCalledWith(1, 4, 2);
  });

  it("即时反馈：没有判定按钮，连满即收束", async () => {
    const user = userEvent.setup();
    render(session("instant"));

    expect(
      screen.queryByRole("button", { name: "判定" }),
    ).not.toBeInTheDocument();

    await connect(user, "serendipity", "意外的好运");
    await connect(user, "lucid", "清晰易懂的");

    expect(
      await screen.findByRole("dialog", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(markListComplete).toHaveBeenCalledWith(1, 2, 0);
  });

  it("切换方式不重置本轮：切到即时后立刻显示结论", async () => {
    const user = userEvent.setup();
    const { rerender } = render(session("manual"));

    await connect(user, "serendipity", "意外的好运");
    expect(card("serendipity，已连接，待判定")).toBeInTheDocument();

    rerender(session("instant"));

    expect(card("serendipity，已正确连接")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "判定" }),
    ).not.toBeInTheDocument();
  });

  it("单词与释义不会落在同一行（即使随机源退化）", () => {
    /* Math.random 恒为 0 时两次洗牌会得到同一排列，正好压到兜底路径上 */
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      render(session("instant", BOARD_WORDS));
    } finally {
      random.mockRestore();
    }

    const terms = columnIds("term");
    const meanings = columnIds("meaning");

    expect(terms).toHaveLength(BOARD_WORDS.length);
    expect(meanings).toHaveLength(BOARD_WORDS.length);
    terms.forEach((id, index) => {
      expect(meanings[index]).not.toBe(id);
    });
    expect(terms).not.toEqual(meanings);
  });
});
