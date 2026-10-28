import type {
  AppDatabase,
  AppSettings,
  CompletionRecord,
  FeedbackMode,
  IntakeSummary,
  ListOverview,
  ParsedIntake,
  RejectedEntry,
  StudyList,
  WordRecord,
} from "@/lib/types";

export const DATABASE_VERSION = 1 as const;
export const DEFAULT_LIST_SIZE = 5;
export const MIN_LIST_SIZE = 2;
export const MAX_LIST_SIZE = 20;
export const DEFAULT_FEEDBACK_MODE: FeedbackMode = "instant";
export const MAX_TERM_LENGTH = 80;
export const MAX_MEANING_LENGTH = 300;

/**
 * 所有函数都是纯函数：输入旧数据包，返回新的数据包，不做任何 I/O。
 * 持久化由 `@/lib/store` 负责，这样业务规则可以在浏览器里同步执行。
 */
export function createEmptyDatabase(): AppDatabase {
  return {
    version: DATABASE_VERSION,
    words: [],
    settings: {
      listSize: DEFAULT_LIST_SIZE,
      feedbackMode: DEFAULT_FEEDBACK_MODE,
    },
    completions: {},
  };
}

function normalizeTerm(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMeaning(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function validateWord(term: string, meaning: string) {
  if (!term) {
    throw new Error("请输入单词");
  }
  if (term.length > MAX_TERM_LENGTH) {
    throw new Error(`单词不能超过 ${MAX_TERM_LENGTH} 个字符`);
  }
  if (!meaning) {
    throw new Error("请输入中文释义");
  }
  if (meaning.length > MAX_MEANING_LENGTH) {
    throw new Error(`释义不能超过 ${MAX_MEANING_LENGTH} 个字符`);
  }
}

function getSettings(db: AppDatabase): AppSettings {
  return {
    listSize: db.settings.listSize,
    feedbackMode: db.settings.feedbackMode,
  };
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

/**
 * 批量收录（Anki 插件 / 粘贴）：容忍脏数据，不抛错。
 *
 * - 超长的单词与释义按边界截断，而不是丢掉整条
 * - 库内已有（忽略大小写）或本批前面已接受的同名单词计入 duplicates，保留库里原有释义
 * - 其余问题（空单词、空释义、解析阶段就不认识的行）归入 rejected，界面报数
 * - 一批只取一次 `now`，追加顺序就是抓取/发送顺序
 */
export function applyIntake(
  db: AppDatabase,
  intake: ParsedIntake,
): { db: AppDatabase; summary: IntakeSummary } {
  const now = new Date().toISOString();
  const seen = new Set(db.words.map((word) => word.term.toLocaleLowerCase()));
  const added: WordRecord[] = [];
  const duplicates: string[] = [];
  const rejected: RejectedEntry[] = [...intake.rejected];

  intake.entries.forEach((entry) => {
    const term = truncate(normalizeTerm(entry.term), MAX_TERM_LENGTH);
    const meaning = truncate(
      normalizeMeaning(entry.meaning),
      MAX_MEANING_LENGTH,
    );

    if (!term) {
      rejected.push({ term: normalizeTerm(entry.term), reason: "单词为空" });
      return;
    }
    if (!meaning) {
      rejected.push({ term, reason: "释义为空" });
      return;
    }

    const key = term.toLocaleLowerCase();
    if (seen.has(key)) {
      duplicates.push(term);
      return;
    }

    seen.add(key);
    added.push({
      id: nextWordId(db.words) + added.length,
      term,
      meaning,
      createdAt: now,
      updatedAt: now,
    });
  });

  const summary: IntakeSummary = { added, duplicates, rejected };
  if (added.length === 0) {
    return { db, summary };
  }

  return { db: { ...db, words: [...db.words, ...added] }, summary };
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

  return { ...db, settings: { ...db.settings, listSize } };
}

export function setFeedbackMode(
  db: AppDatabase,
  value: unknown,
): AppDatabase {
  if (value !== "instant" && value !== "manual") {
    throw new Error("反馈方式无效");
  }

  return { ...db, settings: { ...db.settings, feedbackMode: value } };
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

/**
 * 「这个词在哪一份清单」的唯一答案：直接由分组结果反查，不另写一份除法，
 * 这样单词库里的编号与清单页永远同源。
 *
 * 编号只由全库 FIFO 位置与每组单词数决定，与搜索、分页无关。
 */
export function getListIndexByWordId(db: AppDatabase): Map<number, number> {
  const indexByWordId = new Map<number, number>();

  getListOverview(db).lists.forEach((list) => {
    list.words.forEach((word) => indexByWordId.set(word.id, list.index));
  });

  return indexByWordId;
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
