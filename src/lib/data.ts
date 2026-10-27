import type {
  AppDatabase,
  AppSettings,
  CompletionRecord,
  ListOverview,
  StudyList,
  WordRecord,
} from "@/lib/types";

export const DATABASE_VERSION = 1 as const;
export const DEFAULT_LIST_SIZE = 5;
export const MIN_LIST_SIZE = 2;
export const MAX_LIST_SIZE = 20;

/**
 * 所有函数都是纯函数：输入旧数据包，返回新的数据包，不做任何 I/O。
 * 持久化由 `@/lib/store` 负责，这样业务规则可以在浏览器里同步执行。
 */
export function createEmptyDatabase(): AppDatabase {
  return {
    version: DATABASE_VERSION,
    words: [],
    settings: { listSize: DEFAULT_LIST_SIZE },
    completions: {},
  };
}

function normalizeTerm(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMeaning(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateWord(term: string, meaning: string) {
  if (!term) {
    throw new Error("请输入单词");
  }
  if (term.length > 80) {
    throw new Error("单词不能超过 80 个字符");
  }
  if (!meaning) {
    throw new Error("请输入中文释义");
  }
  if (meaning.length > 300) {
    throw new Error("释义不能超过 300 个字符");
  }
}

function getSettings(db: AppDatabase): AppSettings {
  return { listSize: db.settings.listSize };
}

export function findDuplicateTerm(
  db: AppDatabase,
  term: string,
  excludeId?: number,
): boolean {
  const normalized = term.toLocaleLowerCase();
  return db.words.some(
    (word) =>
      word.id !== excludeId && word.term.toLocaleLowerCase() === normalized,
  );
}

function nextWordId(words: WordRecord[]): number {
  return words.reduce((max, word) => Math.max(max, word.id), 0) + 1;
}

export function createWord(
  db: AppDatabase,
  termValue: unknown,
  meaningValue: unknown,
): AppDatabase {
  const term = normalizeTerm(termValue);
  const meaning = normalizeMeaning(meaningValue);
  validateWord(term, meaning);

  if (findDuplicateTerm(db, term)) {
    throw new Error("这个单词已经在词库中了");
  }

  const now = new Date().toISOString();
  const word: WordRecord = {
    id: nextWordId(db.words),
    term,
    meaning,
    createdAt: now,
    updatedAt: now,
  };

  return { ...db, words: [...db.words, word] };
}

export function updateWord(
  db: AppDatabase,
  id: number,
  termValue: unknown,
  meaningValue: unknown,
): AppDatabase {
  const term = normalizeTerm(termValue);
  const meaning = normalizeMeaning(meaningValue);
  validateWord(term, meaning);

  const existing = db.words.find((word) => word.id === id);
  if (!existing) {
    throw new Error("单词不存在");
  }

  if (findDuplicateTerm(db, term, id)) {
    throw new Error("这个单词已经在词库中了");
  }

  const updatedAt = new Date().toISOString();
  return {
    ...db,
    words: db.words.map((word) =>
      word.id === id ? { ...word, term, meaning, updatedAt } : word,
    ),
  };
}

export function deleteWord(db: AppDatabase, id: number): AppDatabase {
  const exists = db.words.some((word) => word.id === id);
  if (!exists) {
    throw new Error("单词不存在");
  }

  return { ...db, words: db.words.filter((word) => word.id !== id) };
}

export function setListSize(db: AppDatabase, listSizeValue: unknown): AppDatabase {
  const listSize = Number(listSizeValue);

  if (
    !Number.isInteger(listSize) ||
    listSize < MIN_LIST_SIZE ||
    listSize > MAX_LIST_SIZE
  ) {
    throw new Error(
      `清单单词数需要在 ${MIN_LIST_SIZE}–${MAX_LIST_SIZE} 之间`,
    );
  }

  return { ...db, settings: { listSize } };
}

/**
 * 清单签名只用来做完成记录的键，不需要抗碰撞，因此直接用单词 ID 拼接：
 * 同步、稳定、零依赖（WebCrypto 的 digest 是异步的，无法在渲染期使用）。
 */
function createSignature(words: WordRecord[]): string {
  return words.map((word) => word.id).join("-");
}

function buildLists(
  words: WordRecord[],
  listSize: number,
  completions: Record<string, CompletionRecord>,
): StudyList[] {
  if (words.length === 0) {
    return [];
  }

  const lists: StudyList[] = [];

  for (let offset = 0; offset < words.length; offset += listSize) {
    const listWords = words.slice(offset, offset + listSize);
    const signature = createSignature(listWords);
    const record = completions[signature];
    const index = lists.length + 1;

    lists.push({
      index,
      startOrder: offset + 1,
      endOrder: offset + listWords.length,
      size: listSize,
      isPartial: listWords.length < listSize,
      status: record ? "completed" : "ready",
      completedAt: record?.completedAt ?? null,
      signature,
      words: listWords,
    });
  }

  return lists;
}

export function getListOverview(db: AppDatabase): ListOverview {
  const settings = getSettings(db);

  return {
    words: db.words,
    settings,
    lists: buildLists(db.words, settings.listSize, db.completions),
  };
}

export function getStudyList(db: AppDatabase, index: number): StudyList | null {
  return getListOverview(db).lists.find((list) => list.index === index) ?? null;
}

export function completeStudyList(
  db: AppDatabase,
  index: number,
  attemptsValue: unknown,
  mistakesValue: unknown,
): AppDatabase {
  const list = getStudyList(db, index);
  if (!list) {
    throw new Error("清单不存在");
  }

  const attempts = Math.max(1, Math.trunc(Number(attemptsValue) || 1));
  const mistakes = Math.max(0, Math.trunc(Number(mistakesValue) || 0));
  const previous = db.completions[list.signature];

  return {
    ...db,
    completions: {
      ...db.completions,
      [list.signature]: {
        completedAt: new Date().toISOString(),
        // 同一份清单多次练习时保留更好的那一轮成绩
        attempts: previous ? Math.min(previous.attempts, attempts) : attempts,
        mistakes: previous ? Math.min(previous.mistakes, mistakes) : mistakes,
      },
    },
  };
}
