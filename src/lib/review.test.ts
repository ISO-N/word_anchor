import { describe, expect, it } from "vitest";
import {
  buildReviewRound,
  REVIEW_MAX_OPTIONS,
  REVIEW_ROUND_SIZE,
  reviewRoundSize,
} from "@/lib/review";
import type { WordRecord } from "@/lib/types";

/** mulberry32：给定种子就能复现同一局，便于断言「登场次数」这类不变量 */
function seeded(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWords(
  meanings: string[],
  terms = meanings.map((_, index) => `word-${index + 1}`),
): WordRecord[] {
  return meanings.map((meaning, index) => ({
    id: index + 1,
    term: terms[index],
    meaning,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    completedAt: null,
    review: null,
  }));
}

function appearances(round: ReturnType<typeof buildReviewRound>) {
  const counts = new Map<number, number>();

  round.forEach((question) => {
    counts.set(question.wordId, (counts.get(question.wordId) ?? 0) + 1);
  });

  return counts;
}

describe("一局题数", () => {
  it("少于两个词无法出题，其余按「每词最多登场 2 次」封顶 10 题", () => {
    expect(reviewRoundSize(0)).toBe(0);
    expect(reviewRoundSize(1)).toBe(0);
    expect(reviewRoundSize(Number.NaN)).toBe(0);
    expect(reviewRoundSize(Number.POSITIVE_INFINITY)).toBe(0);
    expect(reviewRoundSize(2)).toBe(4);
    expect(reviewRoundSize(3)).toBe(6);
    expect(reviewRoundSize(4)).toBe(8);
    expect(reviewRoundSize(5)).toBe(10);
    expect(reviewRoundSize(100)).toBe(REVIEW_ROUND_SIZE);
  });
});

describe("均匀牌堆", () => {
  it("5 个词出 10 题，每个词恰好登场 2 次", () => {
    const round = buildReviewRound(makeWords(["一", "二", "三", "四", "五"]), seeded(7));

    expect(round).toHaveLength(10);
    expect([...appearances(round).values()]).toEqual([2, 2, 2, 2, 2]);
  });

  it("2 个词出 4 题，每个词恰好 2 次", () => {
    const round = buildReviewRound(makeWords(["甲", "乙"]), seeded(1));

    expect(round).toHaveLength(4);
    expect([...appearances(round).values()]).toEqual([2, 2]);
  });

  it("6 个词出 10 题，登场次数最多相差 1", () => {
    const round = buildReviewRound(
      makeWords(["一", "二", "三", "四", "五", "六"]),
      seeded(11),
    );
    const counts = [...appearances(round).values()];

    expect(round).toHaveLength(10);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("相邻两题永远不是同一个词（包括换牌堆的边界）", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const round = buildReviewRound(
        makeWords(["一", "二", "三", "四", "五"]),
        seeded(seed),
      );

      round.slice(1).forEach((question, index) => {
        expect(question.wordId).not.toBe(round[index].wordId);
      });
    }
  });

  it("随机源退化为恒等洗牌时也不会连续出同一个词", () => {
    /* Math.random 恒为 0 时两副牌是同一个排列，边界正好会撞上上一题 */
    const round = buildReviewRound(makeWords(["一", "二", "三"]), () => 0);

    round.slice(1).forEach((question, index) => {
      expect(question.wordId).not.toBe(round[index].wordId);
    });
    expect(round).toHaveLength(6);
  });

  it("不修改传入的单词数组", () => {
    const words = makeWords(["一", "二", "三", "四"]);
    const before = words.map((word) => word.id);

    buildReviewRound(words, seeded(3));

    expect(words.map((word) => word.id)).toEqual(before);
  });
});

describe("选项", () => {
  it("每题恰好一个正确项，且正确项就是本题单词", () => {
    const words = makeWords(["一", "二", "三", "四", "五"]);
    const round = buildReviewRound(words, seeded(5));

    round.forEach((question) => {
      const correct = question.options.filter(
        (option) => option.wordId === question.correctId,
      );

      expect(question.correctId).toBe(question.wordId);
      expect(correct).toHaveLength(1);
      expect(correct[0].meaning).toBe(
        words.find((word) => word.id === question.wordId)?.meaning,
      );
    });
  });

  it("词库够大时每题 4 个选项，干扰项都来自其他单词", () => {
    const round = buildReviewRound(
      makeWords(["一", "二", "三", "四", "五"]),
      seeded(9),
    );

    round.forEach((question) => {
      expect(question.options).toHaveLength(REVIEW_MAX_OPTIONS);
      question.options.forEach((option) => {
        if (option.wordId === question.correctId) return;
        expect(option.wordId).not.toBe(question.wordId);
      });
    });
  });

  it("选项按释义文本去重；同义词不会变成自己的干扰项", () => {
    const words = makeWords(["相同的释义", "相同的释义", "别的释义"]);
    const round = buildReviewRound(words, seeded(4));

    round.forEach((question) => {
      const meanings = question.options.map((option) => option.meaning);

      expect(new Set(meanings).size).toBe(meanings.length);
      expect(meanings.filter((meaning) => meaning === "相同的释义")).toHaveLength(1);
    });
  });

  it("释义种类不足时选项降级，而不是补假选项", () => {
    const two = buildReviewRound(makeWords(["甲", "乙"]), seeded(2));
    two.forEach((question) => {
      expect(question.options).toHaveLength(2);
    });

    const three = buildReviewRound(makeWords(["甲", "乙", "丙"]), seeded(2));
    three.forEach((question) => {
      expect(question.options).toHaveLength(3);
    });
  });

  it("词库只有一个词时不构建轮次", () => {
    expect(buildReviewRound(makeWords(["孤词"]), seeded(1))).toEqual([]);
  });

  it("题面来自出题时的快照", () => {
    const words = makeWords(["一", "二", "三"]);
    const round = buildReviewRound(words, seeded(8));

    round.forEach((question) => {
      expect(question.term).toBe(
        words.find((word) => word.id === question.wordId)?.term,
      );
    });
  });
});
