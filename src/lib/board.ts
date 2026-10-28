import type { WordRecord } from "@/lib/types";

/**
 * 练习板两列的排布。`meanings[i]` 永远不是 `terms[i]` 指向的那个词。
 *
 * 为什么需要约束：两列各自独立洗牌时，两列完全同序的概率是 1/n!，
 * 而「至少有一行词与释义同处一行」的概率是 1 − !n/n!（5 个词约 63%）。
 * 也就是说随机洗牌本身就会经常把答案摆在正确的位置上，所以这里强制错排
 * （derangement）：`meanings[i].id !== terms[i].id` 对所有行恒成立。
 */
export type BoardOrder = {
  terms: WordRecord[];
  meanings: WordRecord[];
};

/** 可注入的随机源：生产用 Math.random，测试用种子 PRNG。 */
export type Random = () => number;

/**
 * 重试到第几次就改用循环位移兜底。n = 5 时单次洗牌正好错排的概率约 37%，
 * 连续 24 次都撞上对位几乎不可能（≈ 1e-5），所以兜底只影响排布多样性，
 * 不影响「同行永不对位」这个不变量。
 */
const MAX_ARRANGE_ATTEMPTS = 24;

/**
 * 把随机源归一化到 [0, 1)。
 *
 * Fisher–Yates 的下标计算依赖这个区间，而测试会把 Math.random 桩成
 * 1 / NaN / Infinity / 17.3 这类越界值——直接相乘会算出越界下标，
 * 让数组里出现 undefined。
 */
function unit(random: Random): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;

  const fraction = value - Math.floor(value);
  return fraction >= 0 && fraction < 1 ? fraction : 0;
}

/** Fisher–Yates：返回新数组，不修改入参。 */
export function shuffle<T>(
  items: readonly T[],
  random: Random = Math.random,
): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(unit(random) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

/** 两列中是否有任何一行放着同一个词（即答案被摆到正确位置）。 */
function hasRowMatch(terms: WordRecord[], meanings: WordRecord[]): boolean {
  return terms.some((word, index) => meanings[index]?.id === word.id);
}

/**
 * 排出练习板的两列顺序。
 *
 * 不变量：`words.length >= 2` 时，`meanings[i].id !== terms[i].id` 恒成立；
 * 因此「两列完全同序」也不可能出现（恒等排列的每一行都是对位）。
 * 只有一个词的清单没有可交换的对象，两列只能同序，属于固有情况。
 */
export function arrangeBoard(
  words: readonly WordRecord[],
  random: Random = Math.random,
): BoardOrder {
  const terms = shuffle(words, random);
  if (terms.length < 2) {
    return { terms, meanings: [...terms] };
  }

  let meanings = shuffle(words, random);
  for (
    let attempt = 0;
    attempt < MAX_ARRANGE_ATTEMPTS && hasRowMatch(terms, meanings);
    attempt += 1
  ) {
    meanings = shuffle(words, random);
  }

  if (!hasRowMatch(terms, meanings)) {
    return { terms, meanings };
  }

  /* 兜底：整列随机位移。位移量恒在 1..n-1，绕回时也不可能落到同一行 */
  const shift = 1 + Math.floor(unit(random) * (terms.length - 1));
  return {
    terms,
    meanings: [...terms.slice(shift), ...terms.slice(0, shift)],
  };
}
