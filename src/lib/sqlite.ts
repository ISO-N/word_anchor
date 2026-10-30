import { normalizeDatabase } from "@/lib/backup";
import { DATABASE_VERSION } from "@/lib/data";
import type { AppDatabase, WordRecord } from "@/lib/types";

/**
 * SQLite 持久层（tauri-plugin-sql）。
 *
 * 只做两件事：把内存快照摊成行、把行拼回快照。业务规则一律留在 `data.ts`，
 * 因此这里没有任何增量更新逻辑——每次写入都是「整表重置 position → upsert
 * 全部行 → 删掉还带着哨兵的旧行」。
 *
 * 为什么不是「一个事务里整表重写」：tauri-plugin-sql 的 JS API 只有
 * `execute` / `select`，没有事务入口，连接池也可能把两次调用分到不同连接上。
 * 所以写入顺序刻意设计成「先标记、再写、最后删」：中途崩溃最多留下几条上一版
 * 仍在词库里的词（下次写入会再删掉），绝不会让整个词库消失。
 */

export const DATABASE_FILE = "word-anchor.db";

/** 一条 upsert 语句最多带多少行，避免 SQLite 的变量数上限 */
export const UPSERT_CHUNK = 40;

/** 落盘过程中的哨兵值：写完新快照后仍等于它的行就是已删除的词 */
const REMOVED_POSITION = -1;

export type DatabaseLike = {
  select<T>(query: string, values?: unknown[]): Promise<T>;
  execute(query: string, values?: unknown[]): Promise<unknown>;
};

export type WordRow = {
  id: number;
  position: number;
  term: string;
  meaning: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  last_captured_at: string | null;
  review_seen: number;
  review_correct: number;
  review_last_reviewed_at: string | null;
  review_last_wrong_at: string | null;
};

export type SettingRow = { key: string; value: string };

/**
 * 顺序必须与写入时的占位符顺序一致。
 * `position` 是 AppDatabase 里「数组下标」的落盘形态：v3 的 words 数组顺序就是
 * FIFO 队列，重排过的词会带着原来的 id 排到末尾，只按 id 排序会把队列弄乱。
 */
export const WORD_COLUMNS = [
  "id",
  "position",
  "term",
  "meaning",
  "created_at",
  "updated_at",
  "completed_at",
  "last_captured_at",
  "review_seen",
  "review_correct",
  "review_last_reviewed_at",
  "review_last_wrong_at",
] as const;

const SCHEMA_V1 = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS words (
     id INTEGER PRIMARY KEY,
     position INTEGER NOT NULL,
     term TEXT NOT NULL,
     meaning TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     completed_at TEXT,
     last_captured_at TEXT,
     review_seen INTEGER NOT NULL DEFAULT 0,
     review_correct INTEGER NOT NULL DEFAULT 0,
     review_last_reviewed_at TEXT,
     review_last_wrong_at TEXT
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS words_term_nocase ON words(term COLLATE NOCASE)",
  "CREATE INDEX IF NOT EXISTS words_position ON words(position)",
  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
];

/** 迁移按 version 递增执行；v1 就是从网页版时代直接落地的第一版 schema */
export const MIGRATIONS: ReadonlyArray<{ version: number; statements: readonly string[] }> = [
  { version: 1, statements: SCHEMA_V1 },
];

export function databaseUrl(): string {
  return `sqlite:${DATABASE_FILE}`;
}

/**
 * SQLite 的 `NOCASE` 只折叠 ASCII 大小写，唯一索引的冲突判断必须用同一把尺子。
 */
function uniqueKey(term: string): string {
  return term.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/** 快照 → words 行。数组顺序写进 position，读回来才能原样还原。 */
export function serializeWords(db: AppDatabase): WordRow[] {
  const seen = new Map<string, string>();

  return db.words.map((word, index) => {
    const key = uniqueKey(word.term);
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `词库里有重复的单词「${word.term}」，无法写入数据库（与「${existing}」只差大小写）`,
      );
    }
    seen.set(key, word.term);

    return {
      id: word.id,
      position: index,
      term: word.term,
      meaning: word.meaning,
      created_at: word.createdAt,
      updated_at: word.updatedAt,
      completed_at: word.completedAt,
      last_captured_at: word.lastCapturedAt ?? null,
      review_seen: word.review?.seen ?? 0,
      review_correct: word.review?.correct ?? 0,
      review_last_reviewed_at: word.review?.lastReviewedAt ?? null,
      review_last_wrong_at: word.review?.lastWrongAt ?? null,
    };
  });
}

export function wordRowValues(row: WordRow): unknown[] {
  return [
    row.id,
    row.position,
    row.term,
    row.meaning,
    row.created_at,
    row.updated_at,
    row.completed_at,
    row.last_captured_at,
    row.review_seen,
    row.review_correct,
    row.review_last_reviewed_at,
    row.review_last_wrong_at,
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/** 一行 → AppDatabase 里的 WordRecord 形状（再交给 normalizeDatabase 清洗） */
export function wordFromRow(row: unknown): WordRecord | null {
  if (!isRecord(row)) return null;
  if (typeof row.id !== "number" && typeof row.id !== "string") return null;
  if (typeof row.term !== "string") return null;

  const lastReviewedAt = nullableText(row.review_last_reviewed_at);

  return {
    id: integer(row.id),
    term: row.term,
    meaning: text(row.meaning),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    completedAt: nullableText(row.completed_at),
    lastCapturedAt: nullableText(row.last_captured_at),
    review: lastReviewedAt
      ? {
          seen: integer(row.review_seen),
          correct: integer(row.review_correct),
          lastReviewedAt,
          lastWrongAt: nullableText(row.review_last_wrong_at),
        }
      : null,
  };
}

/**
 * 行 + settings → AppDatabase。
 *
 * 一律再过一遍 `normalizeDatabase`：磁盘上的数据被外部工具改过、或者来自更旧的
 * 版本时，界面拿到的仍然是可用的快照，而不是一堆 `undefined`。
 */
export function deserializeSnapshot(
  wordRows: unknown,
  settingRows: unknown,
): AppDatabase | null {
  if (!Array.isArray(wordRows)) return null;

  const words = wordRows
    .map(wordFromRow)
    .filter((word): word is WordRecord => word !== null);

  /* 有行、却一行都认不出来：宁可告诉调用方「读不出来」，也不要拿空库覆盖它 */
  if (wordRows.length > 0 && words.length === 0) return null;

  const settings = new Map<string, string>();
  if (Array.isArray(settingRows)) {
    settingRows.forEach((row) => {
      if (!isRecord(row) || typeof row.key !== "string") return;
      settings.set(row.key, text(row.value));
    });
  }

  return normalizeDatabase({
    version: DATABASE_VERSION,
    words,
    settings: {
      listSize: Number(settings.get("listSize")),
      feedbackMode: settings.get("feedbackMode"),
    },
  });
}

export async function migrate(db: DatabaseLike): Promise<void> {
  const rows = await db.select<Array<{ user_version?: unknown }>>("PRAGMA user_version");
  const current = integer(rows[0]?.user_version);

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    for (const statement of migration.statements) {
      await db.execute(statement);
    }

    /* PRAGMA 不接受参数绑定，版本号来自本文件的常量 */
    await db.execute(`PRAGMA user_version = ${migration.version}`);
  }
}

export async function loadSnapshotFrom(db: DatabaseLike): Promise<AppDatabase | null> {
  const words = await db.select<unknown[]>(
    `SELECT ${WORD_COLUMNS.join(", ")} FROM words ORDER BY position ASC`,
  );
  const settings = await db.select<unknown[]>("SELECT key, value FROM settings");

  return deserializeSnapshot(words, settings);
}

export async function saveSnapshotTo(
  db: DatabaseLike,
  snapshot: AppDatabase,
): Promise<void> {
  const rows = serializeWords(snapshot);
  const columnCount = WORD_COLUMNS.length;

  /* 先把所有行的 position 打成哨兵：等新快照写完，还剩哨兵的就是已删除的词。
     这样删除不依赖 id 列表，也不会出现「旧行和新行抢同一个 position」。 */
  await db.execute(`UPDATE words SET position = ${REMOVED_POSITION}`);

  for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK) {
    const chunk = rows.slice(offset, offset + UPSERT_CHUNK);
    const placeholders = chunk
      .map(
        (_row, rowIndex) =>
          `(${WORD_COLUMNS.map(
            (_column, columnIndex) => `$${rowIndex * columnCount + columnIndex + 1}`,
          ).join(", ")})`,
      )
      .join(", ");

    await db.execute(
      `INSERT OR REPLACE INTO words (${WORD_COLUMNS.join(", ")}) VALUES ${placeholders}`,
      chunk.flatMap(wordRowValues),
    );
  }

  await db.execute(`DELETE FROM words WHERE position = ${REMOVED_POSITION}`);

  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('listSize', $1)",
    [String(snapshot.settings.listSize)],
  );
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('feedbackMode', $1)",
    [snapshot.settings.feedbackMode],
  );
  await db.execute(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', $1)",
    [String(DATABASE_VERSION)],
  );
}

let databasePromise: Promise<DatabaseLike> | null = null;

/**
 * 打开（并按需迁移）词锚数据库。
 * 动态 import 让 jsdom 单测与浏览器预览都不去碰 Tauri IPC。
 */
export function openDatabase(): Promise<DatabaseLike> {
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = await Database.load(databaseUrl());
    await migrate(db as DatabaseLike);
    return db as DatabaseLike;
  })().catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}
