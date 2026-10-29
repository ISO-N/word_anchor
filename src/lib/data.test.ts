import { describe, expect, it } from "vitest";
import {
  applyIntake,
  completeStudyList,
  createEmptyDatabase,
  createWord,
  deleteWord,
  getListIndexByWordId,
  getListOverview,
  getStudyList,
  setFeedbackMode,
  setListSize,
  updateWord,
} from "@/lib/data";
import type { AppDatabase } from "@/lib/types";

const TERMS = [
  "serendipity",
  "ephemeral",
  "lucid",
  "arduous",
  "resilient",
  "meticulous",
  "ubiquitous",
  "candid",
  "verbose",
  "frugal",
  "tenacious",
  "ambiguous",
  "pragmatic",
  "nostalgia",
  "eloquent",
  "indifferent",
  "benevolent",
  "cumbersome",
  "diligent",
  "obsolete",
  "plausible",
  "tranquil",
  "vivid",
  "wary",
  "zealous",
];

function seed(count: number): AppDatabase {
  return TERMS.slice(0, count).reduce<AppDatabase>(
    (db, term) => createWord(db, term, `${term} 的释义`),
    createEmptyDatabase(),
  );
}

/** Anki 侧的一条抓取时间；只要比库里记得的更新就算「又忘了」 */
const CAPTURED_AT = "2024-05-01T09:00:00.000+00:00";

describe("清单编排", () => {
  it("25 个词、每组 5 个 → 5 份清单", () => {
    const { lists } = getListOverview(seed(25));

    expect(lists).toHaveLength(5);
    expect(lists.map((list) => list.index)).toEqual([1, 2, 3, 4, 5]);
    expect(lists.every((list) => list.words.length === 5)).toBe(true);
    expect(lists.every((list) => list.isPartial === false)).toBe(true);
    expect(lists[1].startOrder).toBe(6);
    expect(lists[1].endOrder).toBe(10);
  });

  it("未排满的最后一组标记为未满一组", () => {
    const { lists } = getListOverview(seed(23));
    const last = lists[lists.length - 1];

    expect(lists).toHaveLength(5);
    expect(last.words).toHaveLength(3);
    expect(last.isPartial).toBe(true);
  });

  it("空词库没有清单", () => {
    expect(getListOverview(createEmptyDatabase()).lists).toEqual([]);
  });

  it("修改每组数量会重新编排，清单签名随之变化", () => {
    const before = getListOverview(seed(25));
    const after = getListOverview(setListSize(seed(25), 6));

    expect(before.lists[0].signature).not.toBe(after.lists[0].signature);
    expect(after.lists).toHaveLength(5);
    expect(after.lists[0].words).toHaveLength(6);
    expect(after.lists[4].words).toHaveLength(1);
  });

  it("getStudyList 对越界编号返回 null", () => {
    const db = seed(10);

    expect(getStudyList(db, 1)?.index).toBe(1);
    expect(getStudyList(db, 3)).toBeNull();
    expect(getStudyList(db, 0)).toBeNull();
  });
});

describe("单词所在清单", () => {
  it("按全库 FIFO 位置映射到清单编号", () => {
    const indexByWordId = getListIndexByWordId(seed(12));

    expect(indexByWordId.get(1)).toBe(1);
    expect(indexByWordId.get(5)).toBe(1);
    expect(indexByWordId.get(6)).toBe(2);
    expect(indexByWordId.get(11)).toBe(3);
    expect(indexByWordId.get(12)).toBe(3);
  });

  it("与清单页的分组完全一致", () => {
    const db = seed(23);
    const indexByWordId = getListIndexByWordId(db);
    const { lists } = getListOverview(db);

    lists.forEach((list) => {
      list.words.forEach((word) => {
        expect(indexByWordId.get(word.id)).toBe(list.index);
      });
    });
    expect(indexByWordId.size).toBe(db.words.length);
  });

  it("删词后后面的词前移，编号重新计算", () => {
    const db = deleteWord(seed(12), 1);

    expect(getListIndexByWordId(db).get(6)).toBe(1);
    expect(getListIndexByWordId(db).get(12)).toBe(3);
  });

  it("修改每组数量后重新映射", () => {
    const indexByWordId = getListIndexByWordId(setListSize(seed(12), 8));

    expect(indexByWordId.get(8)).toBe(1);
    expect(indexByWordId.get(9)).toBe(2);
  });

  it("空词库没有任何映射", () => {
    expect(getListIndexByWordId(createEmptyDatabase()).size).toBe(0);
  });
});

describe("反馈方式设置", () => {
  it("默认即时反馈", () => {
    expect(createEmptyDatabase().settings.feedbackMode).toBe("instant");
    expect(getListOverview(seed(3)).settings.feedbackMode).toBe("instant");
  });

  it("切换为手动判定，且不会丢掉每组单词数", () => {
    const sized = setListSize(seed(3), 8);
    const manual = setFeedbackMode(sized, "manual");

    expect(manual.settings.feedbackMode).toBe("manual");
    expect(manual.settings.listSize).toBe(8);
    expect(setListSize(manual, 4).settings.feedbackMode).toBe("manual");
  });

  it("非法反馈方式会被拒绝", () => {
    expect(() => setFeedbackMode(createEmptyDatabase(), "auto")).toThrow(
      "反馈方式无效",
    );
  });
});

describe("完成记录", () => {
  it("练完一份清单时，组内每个词都记上完成时间", () => {
    const db = completeStudyList(seed(5), 1);
    const { lists } = getListOverview(db);

    expect(lists[0].status).toBe("completed");
    expect(lists[0].completedAt).not.toBeNull();
    expect(lists[0].words.every((word) => word.completedAt)).toBe(true);
  });

  it("只影响被练的那一组，别的组的词不受牵连", () => {
    const { lists } = getListOverview(completeStudyList(seed(10), 2));

    expect(lists[0].status).toBe("ready");
    expect(lists[1].status).toBe("completed");
    expect(lists[0].words.every((word) => word.completedAt === null)).toBe(true);
  });

  it("重排之后老清单仍是已完成，含重排词的末组回到待练习", () => {
    const done = [1, 2, 3].reduce(
      (db, index) => completeStudyList(db, index),
      seed(15),
    );
    expect(getListOverview(done).lists.map((list) => list.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);

    const { db, summary } = applyIntake(done, {
      entries: [
        { term: TERMS[2], meaning: "新的释义", capturedAt: CAPTURED_AT },
      ],
      rejected: [],
    });

    expect(summary.requeued).toEqual([TERMS[2]]);
    expect(db.words[db.words.length - 1].term).toBe(TERMS[2]);
    expect(getListOverview(db).lists.map((list) => list.status)).toEqual([
      "completed",
      "completed",
      "ready",
    ]);
    expect(getListOverview(db).lists[2].words.at(-1)?.term).toBe(TERMS[2]);
  });

  it("不存在的清单编号会抛错", () => {
    expect(() => completeStudyList(seed(5), 9)).toThrow("清单不存在");
  });
});

describe("单词校验", () => {
  it("单词去重忽略大小写", () => {
    const db = createWord(createEmptyDatabase(), "Serendipity", "好运");
    expect(() => createWord(db, "serendipity", "另一个释义")).toThrow(
      "这个单词已经在词库中了",
    );
  });

  it("编辑成已存在的单词会被拦下", () => {
    const db = seed(2);
    expect(() => updateWord(db, 2, TERMS[0].toUpperCase(), "释义")).toThrow(
      "这个单词已经在词库中了",
    );
  });

  it("空白与超长输入会被拒绝", () => {
    const empty = createEmptyDatabase();

    expect(() => createWord(empty, "   ", "释义")).toThrow("请输入单词");
    expect(() => createWord(empty, "word", "  ")).toThrow("请输入中文释义");
    expect(() => createWord(empty, "a".repeat(81), "释义")).toThrow(
      "单词不能超过 80 个字符",
    );
    expect(() => createWord(empty, "word", "义".repeat(301))).toThrow(
      "释义不能超过 300 个字符",
    );
  });

  it("边界长度可以通过", () => {
    const db = createWord(
      createEmptyDatabase(),
      "a".repeat(80),
      "义".repeat(300),
    );
    expect(db.words[0].term).toHaveLength(80);
    expect(db.words[0].meaning).toHaveLength(300);
  });

  it("每组数量必须在 2–20 之间", () => {
    const db = createEmptyDatabase();

    expect(() => setListSize(db, 1)).toThrow("清单单词数需要在 2–20 之间");
    expect(() => setListSize(db, 21)).toThrow("清单单词数需要在 2–20 之间");
    expect(() => setListSize(db, 2.5)).toThrow("清单单词数需要在 2–20 之间");
    expect(setListSize(db, 20).settings.listSize).toBe(20);
  });

  it("删除单词后清单重新编排", () => {
    const db = seed(6);
    const removed = deleteWord(db, 1);
    const { lists } = getListOverview(removed);

    expect(removed.words).toHaveLength(5);
    expect(lists).toHaveLength(1);
    expect(lists[0].words[0].term).toBe(TERMS[1]);
  });
});

describe("批量收录", () => {
  it("按发送顺序接在词库末尾，id 接着递增", () => {
    const before = seed(2);
    const { db, summary } = applyIntake(before, {
      entries: [
        { term: "lucid", meaning: "清晰易懂的" },
        { term: "candid", meaning: "坦率的" },
      ],
      rejected: [],
    });

    expect(summary.added.map((word) => word.term)).toEqual(["lucid", "candid"]);
    expect(db.words.map((word) => word.term)).toEqual([
      TERMS[0],
      TERMS[1],
      "lucid",
      "candid",
    ]);
    expect(db.words.map((word) => word.id)).toEqual([1, 2, 3, 4]);
    expect(summary.duplicates).toEqual([]);
    expect(summary.rejected).toEqual([]);
  });

  it("重发（抓取时间没变）只去重，保留原有释义与顺序", () => {
    const before = applyIntake(createEmptyDatabase(), {
      entries: [
        { term: "serendipity", meaning: "旧释义", capturedAt: CAPTURED_AT },
      ],
      rejected: [],
    }).db;

    const { db, summary } = applyIntake(before, {
      entries: [
        { term: "serendipity", meaning: "新释义", capturedAt: CAPTURED_AT },
      ],
      rejected: [],
    });

    expect(summary.added).toEqual([]);
    expect(summary.duplicates).toEqual(["serendipity"]);
    expect(summary.requeued).toEqual([]);
    expect(db).toBe(before);
    expect(db.words[0].meaning).toBe("旧释义");
  });

  it("更旧的抓取时间也不算又忘一次，不挪位", () => {
    const before = applyIntake(createEmptyDatabase(), {
      entries: [{ term: "lucid", meaning: "清晰易懂的", capturedAt: CAPTURED_AT }],
      rejected: [],
    }).db;

    const { db, summary } = applyIntake(before, {
      entries: [
        {
          term: "lucid",
          meaning: "清晰易懂的",
          capturedAt: "2020-01-01T00:00:00.000+00:00",
        },
      ],
      rejected: [],
    });

    expect(summary.duplicates).toEqual(["lucid"]);
    expect(db).toBe(before);
  });

  it("新的抓取时间 = 又忘了一次：挪到队尾并清掉完成标记", () => {
    const done = completeStudyList(seed(5), 1);
    const { db, summary } = applyIntake(done, {
      entries: [{ term: TERMS[2], meaning: "新释义", capturedAt: CAPTURED_AT }],
      rejected: [],
    });

    expect(summary.added).toEqual([]);
    expect(summary.duplicates).toEqual([]);
    expect(summary.requeued).toEqual([TERMS[2]]);
    expect(db.words.map((word) => word.term)).toEqual([
      TERMS[0],
      TERMS[1],
      TERMS[3],
      TERMS[4],
      TERMS[2],
    ]);
    expect(db.words[4].meaning).toBe(`${TERMS[2]} 的释义`);
    expect(db.words[4].completedAt).toBeNull();
    expect(db.words[4].lastCapturedAt).toBe(CAPTURED_AT);
    /* 组成变了而且含没练过的词，所以整组回到待练习 */
    expect(getListOverview(db).lists[0].status).toBe("ready");
  });

  it("手工粘贴没有时间戳时，也当作又忘了一次", () => {
    const before = createWord(createEmptyDatabase(), "Serendipity", "旧释义");
    const { db, summary } = applyIntake(before, {
      entries: [{ term: "serendipity", meaning: "新释义" }],
      rejected: [],
    });

    expect(summary.requeued).toEqual(["serendipity"]);
    expect(summary.duplicates).toEqual([]);
    expect(db.words[0].meaning).toBe("旧释义");
  });

  it("已经在队尾的词不再移动，但完成标记会被清掉", () => {
    const done = completeStudyList(seed(5), 1);
    const { db, summary } = applyIntake(done, {
      entries: [{ term: TERMS[4], meaning: "新释义", capturedAt: CAPTURED_AT }],
      rejected: [],
    });

    expect(summary.requeued).toEqual([TERMS[4]]);
    expect(db.words.map((word) => word.term)).toEqual(TERMS.slice(0, 5));
    expect(db.words[4].completedAt).toBeNull();
    expect(getListOverview(db).lists[0].status).toBe("ready");
  });

  it("同一批里同一个词只重排一次", () => {
    const done = completeStudyList(seed(5), 1);
    const { db, summary } = applyIntake(done, {
      entries: [
        { term: TERMS[2], meaning: "第一次", capturedAt: CAPTURED_AT },
        {
          term: TERMS[2],
          meaning: "第二次",
          capturedAt: "2024-06-01T09:00:00.000+00:00",
        },
      ],
      rejected: [],
    });

    expect(summary.requeued).toEqual([TERMS[2]]);
    expect(summary.duplicates).toEqual([TERMS[2]]);
    expect(db.words).toHaveLength(5);
    expect(db.words[4].term).toBe(TERMS[2]);
  });

  it("新词在前、重排词在最后，批内顺序就是发送顺序", () => {
    const done = completeStudyList(seed(5), 1);
    const { db } = applyIntake(done, {
      entries: [
        { term: "harbinger", meaning: "预兆" },
        { term: TERMS[2], meaning: "新释义", capturedAt: CAPTURED_AT },
        { term: "quaint", meaning: "古雅的" },
      ],
      rejected: [],
    });

    expect(db.words.map((word) => word.term)).toEqual([
      TERMS[0],
      TERMS[1],
      TERMS[3],
      TERMS[4],
      "harbinger",
      "quaint",
      TERMS[2],
    ]);
    expect(db.words.map((word) => word.id)).toEqual([1, 2, 4, 5, 6, 7, 3]);
  });

  it("新收录的词记下抓取时间", () => {
    const { db } = applyIntake(createEmptyDatabase(), {
      entries: [{ term: "lucid", meaning: "清晰易懂的", capturedAt: CAPTURED_AT }],
      rejected: [],
    });

    expect(db.words[0].lastCapturedAt).toBe(CAPTURED_AT);
    expect(db.words[0].completedAt).toBeNull();
  });

  it("同一批里的重复只收第一条", () => {
    const { db, summary } = applyIntake(createEmptyDatabase(), {
      entries: [
        { term: "Lucid", meaning: "清晰易懂的" },
        { term: "lucid", meaning: "另一个释义" },
      ],
      rejected: [],
    });

    expect(db.words).toHaveLength(1);
    expect(db.words[0].meaning).toBe("清晰易懂的");
    expect(summary.duplicates).toEqual(["lucid"]);
  });

  it("超长的单词与释义按边界截断，而不是丢掉整条", () => {
    const { db, summary } = applyIntake(createEmptyDatabase(), {
      entries: [{ term: "a".repeat(90), meaning: "义".repeat(320) }],
      rejected: [],
    });

    expect(summary.added).toHaveLength(1);
    expect(db.words[0].term).toHaveLength(80);
    expect(db.words[0].meaning).toHaveLength(300);
  });

  it("空单词与空释义进 rejected，其余照常收录", () => {
    const { db, summary } = applyIntake(createEmptyDatabase(), {
      entries: [
        { term: "   ", meaning: "有释义没单词" },
        { term: "lucid", meaning: "   " },
        { term: "candid", meaning: "坦率的" },
      ],
      rejected: [{ term: "x", reason: "这一行缺少 Tab 分隔" }],
    });

    expect(db.words.map((word) => word.term)).toEqual(["candid"]);
    expect(summary.rejected).toEqual([
      { term: "x", reason: "这一行缺少 Tab 分隔" },
      { term: "", reason: "单词为空" },
      { term: "lucid", reason: "释义为空" },
    ]);
  });

  it("空批次返回同一个数据包，不产生新引用", () => {
    const before = seed(3);
    const { db, summary } = applyIntake(before, {
      entries: [],
      rejected: [],
    });

    expect(db).toBe(before);
    expect(summary).toEqual({
      added: [],
      duplicates: [],
      requeued: [],
      rejected: [],
    });
  });

  it("不改动传入的数据包", () => {
    const before = completeStudyList(seed(3), 1);
    const snapshot = JSON.parse(JSON.stringify(before)) as AppDatabase;

    applyIntake(before, {
      entries: [
        { term: "lucid", meaning: "清晰易懂的" },
        { term: TERMS[0], meaning: "旧词新释义", capturedAt: CAPTURED_AT },
      ],
      rejected: [],
    });

    expect(before).toEqual(snapshot);
    expect(before.words).toHaveLength(3);
    expect(before.words[0].completedAt).not.toBeNull();
  });

  it("收录的词接在后面，不打断已编排的清单", () => {
    const { db } = applyIntake(seed(5), {
      entries: [
        { term: "harbinger", meaning: "预兆" },
        { term: "quaint", meaning: "古雅的" },
      ],
      rejected: [],
    });
    const { lists } = getListOverview(db);

    expect(lists).toHaveLength(2);
    expect(lists[0].words).toHaveLength(5);
    expect(lists[1].words.map((word) => word.term)).toEqual([
      "harbinger",
      "quaint",
    ]);
    expect(lists[1].isPartial).toBe(true);
  });
});
