import { shuffle, type Random } from "@/lib/board";
import type { WordRecord } from "@/lib/types";

/**
 * 趣味复习的出题规则。
 *
 * 和 `board.ts` 一样是纯函数 + 可注入随机源：同一颗种子能复现同一局，
 * 因此「每个词登场几次」「选项里有没有重复释义」这类不变量都能单测。
 */

/** 一局最多几题；词库很小时按「每个词最多登场 2 次」缩短 */
export const REVIEW_ROUND_SIZE = 10;
/** 每题最多几个释义选项（1 个正确 + 3 个干扰） */
export const REVIEW_MAX_OPTIONS = 4;

export type ReviewOption = {
  /** 这个释义来自哪个单词；正确项就是本题单词的 id */
  wordId: number;
  meaning: string;
};

export type ReviewQuestion = {
  wordId: number;
  /** 出题时的快照：答题途中别的标签页删词也不影响这一局 */
  term: string;
  /** 已洗牌，含正确项 */
  options: ReviewOption[];
  /** 正确项的 wordId，恒等于 wordId */
  correctId: number;
};

/**
 * 一局题数：少于 2 个词无法凑出一个选项对，返回 0；
 * 否则 `min(10, 单词数 × 2)`——5 个词及以上都是 10 题，
 * 2 / 3 / 4 个词分别是 4 / 6 / 8 题，保证每个词最多登场 2 次。
 */
export function reviewRoundSize(wordCount: number): number {
  if (!Number.isFinite(wordCount) || wordCount < 2) return 0;
  return Math.min(REVIEW_ROUND_SIZE, Math.trunc(wordCount) * 2);
}

/** 判断「同义」只用文本：词库允许不同单词共享同一条释义 */
function meaningKey(meaning: string): string {
  return meaning.trim().toLocaleLowerCase();
}

/**
 * 一道题：正确释义 + 至多 3 个来自其他单词的干扰项。
 *
 * - 干扰项排除本题单词，也排除与正确答案文本相同的释义，
 *   否则会出现两个字面一样的选项，用户没法选对
 * - 选项按释义文本去重，词库释义种类不足时自然降级为 2–3 个选项
 * - 正确项与干扰项一起再洗一次，正确位置随机
 */
function buildQuestion(
  target: WordRecord,
  words: readonly WordRecord[],
  random: Random,
): ReviewQuestion {
  const seenKeys = new Set([meaningKey(target.meaning)]);
  const distractors: ReviewOption[] = [];

  shuffle(words, random).forEach((word) => {
    if (word.id === target.id) return;

    const key = meaningKey(word.meaning);
    if (seenKeys.has(key)) return;

    seenKeys.add(key);
    distractors.push({ wordId: word.id, meaning: word.meaning });
  });

  const options = shuffle(
    [
      { wordId: target.id, meaning: target.meaning },
      ...distractors.slice(0, REVIEW_MAX_OPTIONS - 1),
    ],
    random,
  );

  return {
    wordId: target.id,
    term: target.term,
    options,
    correctId: target.id,
  };
}

/**
 * 排出一整局。
 *
 * 发牌方式：把全库洗成一副牌依次发，发完重新洗。题数不超过单词数 × 2，
 * 所以：
 * - 每个单词一局最多出现 2 次，出现次数最多相差 1；
 * - 每副牌内部不会重复，换牌堆时若下一张正好是上一题的问词，
 *   就与下一张交换（不丢牌），保证相邻两题不是同一个词。
 */
export function buildReviewRound(
  words: readonly WordRecord[],
  random: Random = Math.random,
): ReviewQuestion[] {
  const total = reviewRoundSize(words.length);
  if (total === 0) return [];

  const questions: ReviewQuestion[] = [];
  let deck: WordRecord[] = shuffle(words, random);
  let cursor = 0;
  let previousId: number | null = null;

  for (let index = 0; index < total; index += 1) {
    if (cursor >= deck.length) {
      deck = shuffle(words, random);
      cursor = 0;
    }

    if (deck.length > 1 && deck[cursor].id === previousId) {
      const swapWith = (cursor + 1) % deck.length;
      [deck[cursor], deck[swapWith]] = [deck[swapWith], deck[cursor]];
    }

    const target = deck[cursor];
    cursor += 1;
    previousId = target.id;
    questions.push(buildQuestion(target, words, random));
  }

  return questions;
}
