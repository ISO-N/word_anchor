import type {
  AppDatabase,
  AppSettings,
  FeedbackMode,
  IntakeSummary,
  ListOverview,
  ParsedIntake,
  RejectedEntry,
  StudyList,
  WordRecord,
} from "@/lib/types";

export const DATABASE_VERSION = 2 as const;
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
    completedAt: null,
    lastCapturedAt: null,
  };

  return { ...db, words: [...db.words, word] };
}

/**
 * 又见到这个词时，是不是「新的一次抓取」（而不是重发）。
 *
 * - 没有时间戳（手工粘贴、旧版插件）→ 当成新抓取，功能不依赖插件升级
 * - 库里没有记录过时间 → 新抓取
 * - 时间戳更晚 → 新抓取；相同或更早 → 重发，只去重不挪位
 */
function isNewerCapture(
  incoming: string | undefined,
  previous: string | null | undefined,
): boolean {
  if (!incoming) return true;
  if (!previous) return true;

  const incomingMs = Date.parse(incoming);
  const previousMs = Date.parse(previous);
  if (Number.isNaN(incomingMs) || Number.isNaN(previousMs)) return true;

  return incomingMs > previousMs;
}

/**
 * 批量收录（Anki 插件 / 粘贴）：容忍脏数据，不抛错。
 *
 * - 超长的单词与释义按边界截断，而不是丢掉整条
 * - 库里已有（忽略大小写）且是新的一次抓取 → 挪到队尾并清掉完成标记（`requeued`），
 *   于是它会在最新一组里再被练一次；库里原释义、createdAt、updatedAt 都不变
 * - 库里已有但只是重发 → 计入 duplicates，一个字节也不改
 * - 本批前面已接受/已重排的同名单词，后面的计入 duplicates
 * - 其余问题（空单词、空释义、解析阶段就不认识的行）归入 rejected，界面报数
 * - 一批只取一次 `now`，新词与重排词都按接收顺序追加
 */
export function applyIntake(
  db: AppDatabase,
  intake: ParsedIntake,
): { db: AppDatabase; summary: IntakeSummary } {
  const now = new Date().toISOString();
  const byTerm = new Map(
    db.words.map((word) => [word.term.toLocaleLowerCase(), word]),
  );
  const requeuedIds = new Set<number>();
  /** 这一批里已经处理过的词（新增或重排）：同批再次出现只算重复 */
  const handledIds = new Set<number>();
  const bumped: WordRecord[] = [];
  const added: WordRecord[] = [];
  const duplicates: string[] = [];
  const requeued: string[] = [];
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
    const existing = byTerm.get(key);

    if (!existing) {
      const word: WordRecord = {
        id: nextWordId(db.words) + added.length,
        term,
        meaning,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        lastCapturedAt: entry.capturedAt ?? null,
      };

      byTerm.set(key, word);
      handledIds.add(word.id);
      added.push(word);
      return;
    }

    if (
      handledIds.has(existing.id) ||
      !isNewerCapture(entry.capturedAt, existing.lastCapturedAt)
    ) {
      duplicates.push(term);
      return;
    }

    handledIds.add(existing.id);
    requeuedIds.add(existing.id);
    requeued.push(term);
    bumped.push({
      ...existing,
      completedAt: null,
      lastCapturedAt: entry.capturedAt ?? existing.lastCapturedAt ?? null,
    });
  });

  const summary: IntakeSummary = { added, duplicates, requeued, rejected };
  if (added.length === 0 && bumped.length === 0) {
    return { db, summary };
  }

  return {
    db: {
      ...db,
      words: [
        ...db.words.filter((word) => !requeuedIds.has(word.id)),
        ...added,
        ...bumped,
      ],
    },
    summary,
  };
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
/**
 * 清单签名只用来做 React key（与清单内单词的一一对应），不需要抗碰撞：
 * 同步、稳定、零依赖（WebCrypto 的 digest 是异步的，无法在渲染期使用）。
 */
function createSignature(words: WordRecord[]): string {
  return words.map((word) => word.id).join("-");
}

/** 组内最晚的完成时间；完成状态按单词记，所以组里没练过的词会让整组回到待练习 */
function latestCompletion(words: WordRecord[]): string | null {
  return words.reduce<string | null>(
    (latest, word) =>
      word.completedAt && (!latest || word.completedAt > latest)
        ? word.completedAt
        : latest,
    null,
  );
}

function buildLists(words: WordRecord[], listSize: number): StudyList[] {
  if (words.length === 0) {
    return [];
  }

  const lists: StudyList[] = [];

  for (let offset = 0; offset < words.length; offset += listSize) {
    const listWords = words.slice(offset, offset + listSize);
    const completed = listWords.every((word) => word.completedAt);
    const index = lists.length + 1;

    lists.push({
      index,
      startOrder: offset + 1,
      endOrder: offset + listWords.length,
      size: listSize,
      isPartial: listWords.length < listSize,
      status: completed ? "completed" : "ready",
      completedAt: completed ? latestCompletion(listWords) : null,
      signature: createSignature(listWords),
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
    lists: buildLists(db.words, settings.listSize),
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

export function completeStudyList(db: AppDatabase, index: number): AppDatabase {
  const list = getStudyList(db, index);
  if (!list) {
    throw new Error("清单不存在");
  }

  const completedAt = new Date().toISOString();
  const ids = new Set(list.words.map((word) => word.id));

  return {
    ...db,
    words: db.words.map((word) =>
      ids.has(word.id) ? { ...word, completedAt } : word,
    ),
  };
}
