import { describe, expect, it } from "vitest";
import { arrangeBoard, shuffle } from "@/lib/board";
import type { WordRecord } from "@/lib/types";

function word(id: number): WordRecord {
  return {
    id,
    term: `word-${id}`,
    meaning: `释义 ${id}`,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    completedAt: null,
  };
}

function words(count: number): WordRecord[] {
  return Array.from({ length: count }, (_, index) => word(index + 1));
}

function ids(list: WordRecord[]): number[] {
  return list.map((item) => item.id);
}

function sortedIds(list: WordRecord[]): number[] {
  return [...ids(list)].sort((a, b) => a - b);
}

/** 32 位种子 PRNG：同一个种子给出同一串随机数，失败可复现。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rowMatches(board: { terms: WordRecord[]; meanings: WordRecord[] }) {
  return board.terms.filter(
    (term, index) => board.meanings[index]?.id === term.id,
  );
}

describe("shuffle", () => {
  it("返回输入的一个排列，且不修改入参", () => {
    const source = words(6);
    const before = ids(source);

    const result = shuffle(source, mulberry32(7));

    expect(ids(source)).toEqual(before);
    expect(result).not.toBe(source);
    expect(sortedIds(result)).toEqual(before);
    expect(result.every(Boolean)).toBe(true);
  });
});

describe("arrangeBoard", () => {
  it("空清单两列都为空", () => {
    expect(arrangeBoard([], mulberry32(1))).toEqual({ terms: [], meanings: [] });
  });

  it("只有一个词时两列都是它（单词语无法错排）", () => {
    const single = words(1);
    const board = arrangeBoard(single, mulberry32(1));

    expect(ids(board.terms)).toEqual([1]);
    expect(ids(board.meanings)).toEqual([1]);
  });

  it("任何种子下，词与释义都不会落在同一行", () => {
    [2, 3, 4, 5, 8, 20].forEach((count) => {
      for (let seed = 1; seed <= 200; seed += 1) {
        const source = words(count);
        const board = arrangeBoard(source, mulberry32(seed));

        expect(ids(board.terms)).toHaveLength(count);
        expect(ids(board.meanings)).toHaveLength(count);
        expect(board.terms.every(Boolean)).toBe(true);
        expect(board.meanings.every(Boolean)).toBe(true);
        expect(sortedIds(board.terms)).toEqual(ids(source));
        expect(sortedIds(board.meanings)).toEqual(ids(source));
        /* 完整同序是对位的特例，这一条同时守住「两列不会一模一样」 */
        expect(ids(board.meanings)).not.toEqual(ids(board.terms));
        expect(rowMatches(board)).toEqual([]);
      }
    });
  });

  it("随机源恒定（洗牌退化成固定排列）时由循环位移兜底", () => {
    [2, 5, 8].forEach((count) => {
      const board = arrangeBoard(words(count), () => 0);

      expect(ids(board.terms)).toHaveLength(count);
      expect(ids(board.meanings)).toHaveLength(count);
      expect(sortedIds(board.meanings)).toEqual(sortedIds(board.terms));
      expect(rowMatches(board)).toEqual([]);
    });
  });

  it("病态随机源不会越界、不会产生 undefined，也不破坏错排", () => {
    const randoms: Array<() => number> = [
      () => 1,
      () => 0.999999,
      () => -0.4,
      () => 17.3,
      () => Number.NaN,
      () => Number.POSITIVE_INFINITY,
    ];

    randoms.forEach((random) => {
      const board = arrangeBoard(words(5), random);

      expect(ids(board.terms)).toHaveLength(5);
      expect(ids(board.meanings)).toHaveLength(5);
      expect(board.terms.every(Boolean)).toBe(true);
      expect(board.meanings.every(Boolean)).toBe(true);
      expect(rowMatches(board)).toEqual([]);
    });
  });

  it("是纯函数：同一种子给出同一份排布，且不改写入参", () => {
    const source = words(6);
    const before = ids(source);

    const first = arrangeBoard(source, mulberry32(42));
    const second = arrangeBoard(source, mulberry32(42));

    expect(ids(first.terms)).toEqual(ids(second.terms));
    expect(ids(first.meanings)).toEqual(ids(second.meanings));
    expect(ids(source)).toEqual(before);
  });

  it("不同种子给出不同的释义排布（不会退化成固定排法）", () => {
    const seen = new Set<string>();

    for (let seed = 1; seed <= 300; seed += 1) {
      const board = arrangeBoard(words(5), mulberry32(seed));
      seen.add(ids(board.meanings).join(","));
    }

    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
