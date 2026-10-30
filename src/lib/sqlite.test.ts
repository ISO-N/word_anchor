import { describe, expect, it } from "vitest";
import { createEmptyDatabase, createWord } from "@/lib/data";
import {
  DATABASE_FILE,
  UPSERT_CHUNK,
  databaseUrl,
  deserializeSnapshot,
  loadSnapshotFrom,
  migrate,
  saveSnapshotTo,
  serializeWords,
  wordRowValues,
  type DatabaseLike,
  type WordRow,
} from "@/lib/sqlite";
import type { AppDatabase, WordRecord } from "@/lib/types";

function word(
  id: number,
  term: string,
  patch: Partial<WordRecord> = {},
): WordRecord {
  return {
    id,
    term,
    meaning: `${term} 的释义`,
    createdAt: `2024-01-0${id}T00:00:00.000Z`,
    updatedAt: `2024-01-0${id}T00:00:00.000Z`,
    completedAt: null,
    lastCapturedAt: null,
    review: null,
    ...patch,
  };
}

function database(words: WordRecord[]): AppDatabase {
  return {
    ...createEmptyDatabase(),
    words,
    settings: { listSize: 8, feedbackMode: "manual" },
  };
}

type Call = { query: string; values: unknown[] };

function fakeDatabase(userVersion = 1): DatabaseLike & {
  calls: Call[];
  selects: string[];
} {
  const calls: Call[] = [];
  const selects: string[] = [];

  return {
    calls,
    selects,
    async select<T>(query: string): Promise<T> {
      selects.push(query);
      if (query.startsWith("PRAGMA user_version")) {
        return [{ user_version: userVersion }] as T;
      }
      return [] as T;
    },
    async execute(query: string, values: unknown[] = []) {
      calls.push({ query, values });
      return { rowsAffected: 1 };
    },
  };
}

describe("快照 ↔ 行", () => {
  it("序列化再还原，内容、统计与顺序都不变", () => {
    const original = database([
      word(7, "lucid", {
        completedAt: "2024-03-01T09:00:00.000Z",
        lastCapturedAt: "2024-04-01T09:00:00.000Z",
        review: {
          seen: 6,
          correct: 5,
          lastReviewedAt: "2024-05-01T09:00:00.000Z",
          lastWrongAt: "2024-04-20T09:00:00.000Z",
        },
      }),
      word(2, "vivid", { meaning: "生动的\n第二行" }),
      word(11, "naïve"),
    ]);

    const rows = serializeWords(original);
    const restored = deserializeSnapshot(rows, [
      { key: "listSize", value: "8" },
      { key: "feedbackMode", value: "manual" },
    ]);

    expect(restored).toEqual(original);
  });

  it("数组顺序写进 position：按 id 排序会打乱队列，position 不会", () => {
    /* 重排过的词带着原来的 id 去了队尾 */
    const original = database([word(2, "vivid"), word(7, "lucid")]);

    const rows = serializeWords(original);

    expect(rows.map((row) => [row.id, row.position])).toEqual([
      [2, 0],
      [7, 1],
    ]);
    expect(deserializeSnapshot(rows, [])?.words.map((item) => item.term)).toEqual([
      "vivid",
      "lucid",
    ]);
  });

  it("一行一值，顺序与 WORD_COLUMNS 对齐", () => {
    const row: WordRow = serializeWords(
      database([word(3, "candid", { completedAt: "2024-02-02T00:00:00.000Z" })]),
    )[0];

    expect(wordRowValues(row)).toEqual([
      3,
      0,
      "candid",
      "candid 的释义",
      "2024-01-03T00:00:00.000Z",
      "2024-01-03T00:00:00.000Z",
      "2024-02-02T00:00:00.000Z",
      null,
      0,
      0,
      null,
      null,
    ]);
  });

  it("只差大小写的重复单词会被按下，而不是留给唯一索引去炸", () => {
    expect(() =>
      serializeWords(database([word(1, "lucid"), word(2, "Lucid")])),
    ).toThrow("重复的单词");
  });

  it("损坏的行被 normalizeDatabase 兜底，而不是整库失败", () => {
    const restored = deserializeSnapshot(
      [
        { id: 1, term: "lucid", meaning: "清晰", review_seen: "abc" },
        { id: 2, term: "vivid", review_seen: 3, review_last_reviewed_at: "2024-06-01T00:00:00.000Z" },
        { id: "oops" },
        "not-a-row",
      ],
      [{ key: "listSize", value: "999" }, { key: "feedbackMode", value: "?" }],
    );

    expect(restored?.words.map((item) => item.term)).toEqual(["lucid", "vivid"]);
    /* 复习次数坏掉的整条统计作废，正常的保留 */
    expect(restored?.words[0].review).toBeNull();
    expect(restored?.words[1].review).toEqual({
      seen: 3,
      correct: 0,
      lastReviewedAt: "2024-06-01T00:00:00.000Z",
      lastWrongAt: null,
    });
    expect(restored?.settings).toEqual({
      listSize: 5,
      feedbackMode: "instant",
    });
  });

  it("整张表读不出来时返回 null，由调用方决定是否从空库开始", () => {
    expect(deserializeSnapshot(null, null)).toBeNull();
    expect(deserializeSnapshot("nope", "nope")).toBeNull();
    /* 有行但一行都认不出来：不能当成「词库是空的」 */
    expect(deserializeSnapshot([null, "x", 3], [])).toBeNull();
  });
});

describe("落盘语句", () => {
  it("先标记、再 upsert 全部行、最后删掉还带哨兵的旧行", async () => {
    const db = fakeDatabase();
    const snapshot = database(
      Array.from({ length: 3 }, (_unused, index) => word(index + 1, `word-${index}`)),
    );

    await saveSnapshotTo(db, snapshot);

    expect(db.calls).toHaveLength(6);
    expect(db.calls[0].query).toBe("UPDATE words SET position = -1");
    expect(db.calls[1].query).toContain("INSERT OR REPLACE INTO words");
    expect(db.calls[1].values).toHaveLength(3 * 12);
    expect(db.calls[2].query).toBe("DELETE FROM words WHERE position = -1");
    expect(db.calls[3].query).toContain("'listSize'");
    expect(db.calls[3].values).toEqual(["8"]);
    expect(db.calls[4].query).toContain("'feedbackMode'");
    expect(db.calls[4].values).toEqual(["manual"]);
    expect(db.calls[5].query).toContain("'schema_version'");
  });

  it("词多了就分块，单条语句不会超过 SQLite 的变量上限", async () => {
    const db = fakeDatabase();
    const snapshot = database(
      Array.from({ length: UPSERT_CHUNK + 1 }, (_unused, index) =>
        word(index + 1, `word-${index}`),
      ),
    );

    await saveSnapshotTo(db, snapshot);

    const inserts = db.calls.filter((call) => call.query.includes("INSERT OR REPLACE INTO words"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toHaveLength(UPSERT_CHUNK * 12);
    expect(inserts[1].values).toHaveLength(12);
  });

  it("空词库也会把 words 清空", async () => {
    const db = fakeDatabase();

    await saveSnapshotTo(db, createEmptyDatabase());

    expect(db.calls[0].query).toBe("UPDATE words SET position = -1");
    expect(db.calls[1].query).toBe("DELETE FROM words WHERE position = -1");
  });

  it("删掉一个词时不会再留下「抢到同一个 position」的旧行", async () => {
    const db = fakeDatabase();
    /* 旧快照里 id=3 在 position=2；新快照里 position=2 换成了 id=4 */
    await saveSnapshotTo(
      db,
      database([word(1, "a"), word(2, "b"), word(4, "d")]),
    );

    const statements = db.calls.map((call) => call.query);
    expect(statements).toContain("UPDATE words SET position = -1");
    expect(statements).toContain("DELETE FROM words WHERE position = -1");
    expect(
      statements.some((query) => query.includes("position >= $1")),
    ).toBe(false);
  });

  it("读库整表按 position 排序，列名与写库一致", async () => {
    const db = fakeDatabase();

    const snapshot = await loadSnapshotFrom(db);

    expect(db.selects[0]).toContain("FROM words ORDER BY position ASC");
    expect(db.selects[0]).toContain("review_last_wrong_at");
    expect(db.selects[1]).toContain("FROM settings");
    expect(snapshot?.words).toEqual([]);
  });
});

describe("schema 迁移", () => {
  it("user_version 为 0 时建表并写下版本", async () => {
    const db = fakeDatabase(0);

    await migrate(db);

    const queries = db.calls.map((call) => call.query);
    expect(queries[0]).toContain("CREATE TABLE IF NOT EXISTS meta");
    expect(queries.some((query) => query.includes("words_term_nocase"))).toBe(true);
    expect(queries.at(-1)).toBe("PRAGMA user_version = 1");
  });

  it("已经是 v1 时不再重复执行", async () => {
    const db = fakeDatabase(1);

    await migrate(db);

    expect(db.calls).toHaveLength(0);
  });

  it("数据库文件就在应用数据目录下", () => {
    expect(databaseUrl()).toBe(`sqlite:${DATABASE_FILE}`);
    expect(DATABASE_FILE).toBe("word-anchor.db");
  });
});

describe("建库语句与 AppDatabase 对齐", () => {
  it("新词从空库开始，id 连续", () => {
    const seeded = createWord(createEmptyDatabase(), "lucid", "清晰易懂的");

    expect(serializeWords(seeded).map((row) => row.id)).toEqual([1]);
  });
});
