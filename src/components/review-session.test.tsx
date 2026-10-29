import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewSession } from "@/components/review-session";
import type { WordRecord } from "@/lib/types";

const { recordReviewResult } = vi.hoisted(() => ({
  recordReviewResult: vi.fn(),
}));

vi.mock("@/lib/store", () => ({ recordReviewResult }));

const TERMS = ["serendipity", "lucid", "anchor", "ephemeral", "tacit"];

const WORDS: WordRecord[] = TERMS.map((term, index) => ({
  id: index + 1,
  term,
  meaning: `释义 ${index + 1}`,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  completedAt: null,
  review: null,
}));

/** 题面单词 → 正确释义，测试里靠它对上答案 */
const MEANING_BY_TERM = new Map(
  WORDS.map((word) => [word.term, word.meaning] as const),
);

function currentTerm(): string {
  return screen.getByRole("heading", { level: 2 }).textContent ?? "";
}

function currentMeaning(): string {
  return MEANING_BY_TERM.get(currentTerm()) ?? "";
}

function optionButtons() {
  return screen
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-keyshortcuts") !== null);
}

/** 未判定时选项的可读名称就是释义本身 */
function correctOption() {
  return screen.getByRole("button", { name: currentMeaning() });
}

function wrongOptions() {
  const correct = currentMeaning();

  return optionButtons().filter(
    (button) => button.getAttribute("aria-label") !== correct,
  );
}

function optionLabelMatching(fragment: string) {
  return optionButtons().some((button) =>
    (button.getAttribute("aria-label") ?? "").includes(fragment),
  );
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("趣味复习的一局", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    /* 恒为 0 的随机源让牌堆与选项顺序可复现 */
    vi.spyOn(Math, "random").mockReturnValue(0);
    recordReviewResult.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("渲染一个单词与四个互不相同的释义选项", () => {
    render(<ReviewSession words={WORDS} />);

    expect(TERMS).toContain(currentTerm());
    expect(screen.getByText("第 1 / 10 题")).toBeInTheDocument();

    const labels = optionButtons().map(
      (option) => option.getAttribute("aria-label") ?? "",
    );

    expect(labels).toHaveLength(4);
    expect(new Set(labels).size).toBe(4);
  });

  it("点对答案：立即标绿、记录统计，并在 900ms 后进入下一题", () => {
    render(<ReviewSession words={WORDS} />);

    fireEvent.click(correctOption());

    expect(recordReviewResult).toHaveBeenCalledTimes(1);
    expect(recordReviewResult).toHaveBeenCalledWith(expect.any(Number), true);
    expect(optionLabelMatching("答对")).toBe(true);

    advance(899);
    expect(screen.getByText("第 1 / 10 题")).toBeInTheDocument();

    advance(1);
    expect(screen.getByText("第 2 / 10 题")).toBeInTheDocument();
    expect(screen.getByText("已答 1 / 10")).toBeInTheDocument();
  });

  it("点错答案：高亮正确答案、反馈里给出正解，1.6s 后才前进", () => {
    render(<ReviewSession words={WORDS} />);

    const chosen = wrongOptions()[0];
    const correctMeaning = currentMeaning();
    fireEvent.click(chosen);

    expect(recordReviewResult).toHaveBeenCalledWith(expect.any(Number), false);
    expect(chosen.getAttribute("aria-label")).toContain("已选，答错");
    expect(optionLabelMatching("正确答案")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(
      `正确答案：${correctMeaning}`,
    );

    advance(900);
    expect(screen.getByText("第 1 / 10 题")).toBeInTheDocument();

    advance(700);
    expect(screen.getByText("第 2 / 10 题")).toBeInTheDocument();
  });

  it("数字键可以选择，重复点击同一题不会重复计分", () => {
    render(<ReviewSession words={WORDS} />);

    fireEvent.keyDown(window, { key: "1" });
    expect(recordReviewResult).toHaveBeenCalledTimes(1);

    fireEvent.click(optionButtons()[0]);
    fireEvent.click(optionButtons()[1]);
    expect(recordReviewResult).toHaveBeenCalledTimes(1);
  });

  it("答完最后一题弹出结算，并保留再来一局按钮", () => {
    render(<ReviewSession words={WORDS} />);

    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(correctOption());
      advance(900);
    }

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("本局结束")).toBeInTheDocument();
    expect(within(dialog).getByText("100%")).toBeInTheDocument();
    expect(recordReviewResult).toHaveBeenCalledTimes(10);
    expect(
      within(dialog).getByRole("button", { name: "再来一局" }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "再来一局" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("第 1 / 10 题")).toBeInTheDocument();
    expect(screen.getByText("已答 0 / 10")).toBeInTheDocument();
  });

  it("重开一局会清空连击与用时", () => {
    render(<ReviewSession words={WORDS} />);

    fireEvent.click(correctOption());
    advance(900);
    fireEvent.click(correctOption());
    advance(2500);

    fireEvent.click(screen.getByRole("button", { name: "重新开始" }));

    expect(screen.getByText("第 1 / 10 题")).toBeInTheDocument();
    expect(screen.getByText("已答 0 / 10")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("词库只有两个词时出 4 题、2 个选项", () => {
    render(<ReviewSession words={WORDS.slice(0, 2)} />);

    expect(screen.getByText("第 1 / 4 题")).toBeInTheDocument();
    expect(optionButtons()).toHaveLength(2);
  });
});
