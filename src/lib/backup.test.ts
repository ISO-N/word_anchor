import { describe, expect, it } from "vitest";
import { normalizeDatabase, parseBackup, serializeBackup } from "@/lib/backup";
import {
  applyIntake,
  completeStudyList,
  createEmptyDatabase,
  createWord,
  getListOverview,
  setFeedbackMode,
  setListSize,
} from "@/lib/data";

function legacyDatabase(settings: Record<string, unknown>) {
  return {
    version: 1,
    words: [],
    settings,
    completions: {},
  };
}

function legacyWord(id: number, term: string) {
  return {
    id,
    term,
    meaning: `${term} 的释义`,
    createdAt: `2024-01-01T00:00:0${id}.000Z`,
    updatedAt: `2024-01-01T00:00:0${id}.000Z`,
  };
}

describe("反馈方式的向后兼容", () => {
  it("旧数据缺少 feedbackMode 时按即时反馈读取", () => {
    expect(
      normalizeDatabase(legacyDatabase({ listSize: 5 }))?.settings.feedbackMode,
    ).toBe("instant");
  });

  it("保留 manual，未知值回落到即时反馈", () => {
    expect(
      normalizeDatabase(
        legacyDatabase({ listSize: 6, feedbackMode: "manual" }),
      )?.settings,
    ).toEqual({ listSize: 6, feedbackMode: "manual" });

    expect(
      normalizeDatabase(
        legacyDatabase({ listSize: 6, feedbackMode: "auto" }),
      )?.settings.feedbackMode,
    ).toBe("instant");
  });

  it("旧备份导入后是即时反馈，导出再导入保留手动判定", () => {
    const legacyBackup = JSON.stringify({
      app: "word-anchor",
      version: 1,
      words: [],
      settings: { listSize: 5 },
      completions: {},
    });

    expect(parseBackup(legacyBackup).settings.feedbackMode).toBe("instant");

    const manual = setFeedbackMode(
      setListSize(createEmptyDatabase(), 6),
      "manual",
    );

    expect(parseBackup(serializeBackup(manual)).settings).toEqual({
      listSize: 6,
      feedbackMode: "manual",
    });
  });
});

describe("完成记录迁移到单词", () => {
  const COMPLETED_AT = "2024-02-01T09:00:00.000Z";

  function legacyWithCompletion() {
    return {
      version: 1,
      words: [1, 2, 3].map((id) => legacyWord(id, `word-${id}`)),
      settings: { listSize: 3, feedbackMode: "instant" },
      completions: {
        "1-2-3": { completedAt: COMPLETED_AT, attempts: 5, mistakes: 1 },
      },
    };
  }

  it("v1 的清单签名会摊到组内每个词上，导出的数据里不再有 completions", () => {
    const db = normalizeDatabase(legacyWithCompletion())!;

    expect(db.version).toBe(3);
    expect("completions" in db).toBe(false);
    expect(db.words.map((word) => word.completedAt)).toEqual([
      COMPLETED_AT,
      COMPLETED_AT,
      COMPLETED_AT,
    ]);
    expect(getListOverview(db).lists[0].status).toBe("completed");
  });

  it("迁移时用 createdAt 兜底抓取时间，升级后第一次发送不会把存量词重排", () => {
    const db = normalizeDatabase(legacyWithCompletion())!;

    expect(db.words[0].lastCapturedAt).toBe(db.words[0].createdAt);
    expect(parseBackup(serializeBackup(db)).words[0].lastCapturedAt).toBe(
      db.words[0].createdAt,
    );
  });

  it("重排过的顺序与完成状态能原样往返", () => {
    const done = completeStudyList(
      ["one", "two", "three"].reduce(
        (db, term) => createWord(db, term, `${term} 的释义`),
        createEmptyDatabase(),
      ),
      1,
    );
    const { db: requeued } = applyIntake(done, {
      entries: [
        { term: "one", meaning: "one 的释义", capturedAt: "2024-05-01T00:00:00.000Z" },
      ],
      rejected: [],
    });

    const reloaded = parseBackup(serializeBackup(requeued));

    expect(reloaded.words.map((word) => word.term)).toEqual([
      "two",
      "three",
      "one",
    ]);
    expect(reloaded.words.at(-1)?.completedAt).toBeNull();
    expect(getListOverview(reloaded).lists[0].status).toBe("ready");
  });

  it("来自更新版本的备份仍然被拒绝", () => {
    expect(() =>
      parseBackup(
        JSON.stringify({ app: "word-anchor", version: 4, words: [] }),
      ),
    ).toThrow("备份文件来自更新版本的词锚");
  });
});

describe("趣味复习统计", () => {
  const REVIEWED_AT = "2024-03-01T10:20:30.000Z";

  it("v2 升级到 v3 只补版本号，手工词的 lastCapturedAt 保持 null", () => {
    const v2 = {
      version: 2,
      words: [
        {
          ...legacyWord(1, "serendipity"),
          completedAt: null,
          lastCapturedAt: null,
        },
      ],
      settings: { listSize: 5, feedbackMode: "instant" },
    };

    const db = normalizeDatabase(v2)!;

    expect(db.version).toBe(3);
    expect(db.words[0].lastCapturedAt).toBeNull();
    expect(db.words[0].review).toBeNull();
  });

  it("导出再导入保留每个词的复习次数与最近答错时间", () => {
    const reviewed = {
      version: 3,
      words: [
        {
          ...legacyWord(1, "serendipity"),
          completedAt: null,
          lastCapturedAt: null,
          review: {
            seen: 7,
            correct: 5,
            lastReviewedAt: REVIEWED_AT,
            lastWrongAt: REVIEWED_AT,
          },
        },
      ],
      settings: { listSize: 5, feedbackMode: "instant" },
    };

    const reloaded = parseBackup(serializeBackup(normalizeDatabase(reviewed)!));

    expect(reloaded.version).toBe(3);
    expect(reloaded.words[0].review).toEqual({
      seen: 7,
      correct: 5,
      lastReviewedAt: REVIEWED_AT,
      lastWrongAt: REVIEWED_AT,
    });
  });

  it("不可信的复习统计归一为 null，不污染单词本身", () => {
    const db = normalizeDatabase({
      version: 3,
      words: [
        {
          ...legacyWord(1, "serendipity"),
          completedAt: null,
          review: { seen: "很多", correct: 3, lastReviewedAt: 42 },
        },
        {
          ...legacyWord(2, "lucid"),
          completedAt: null,
          review: {
            seen: 3,
            correct: 99,
            lastReviewedAt: REVIEWED_AT,
            lastWrongAt: null,
          },
        },
      ],
      settings: { listSize: 5, feedbackMode: "instant" },
    })!;

    expect(db.words[0].review).toBeNull();
    /* 答对数不能超过被问到的次数 */
    expect(db.words[1].review?.correct).toBe(3);
  });
});
