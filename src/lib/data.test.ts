import { describe, expect, it } from "vitest";
import {
  completeStudyList,
  createEmptyDatabase,
  createWord,
  deleteWord,
  getListOverview,
  getStudyList,
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

describe("完成记录", () => {
  it("同一份清单重复练习时保留更好的一轮成绩", () => {
    const db = seed(5);
    const once = completeStudyList(db, 1, 7, 3);
    const twice = completeStudyList(once, 1, 5, 1);
    const signature = getStudyList(twice, 1)!.signature;
    const record = twice.completions[signature];

    expect(record.attempts).toBe(5);
    expect(record.mistakes).toBe(1);
    expect(getStudyList(twice, 1)?.status).toBe("completed");
  });

  it("练习记录按清单签名关联，不会串到别的清单", () => {
    const db = seed(10);
    const completed = completeStudyList(db, 2, 4, 0);
    const { lists } = getListOverview(completed);

    expect(lists[0].status).toBe("ready");
    expect(lists[1].status).toBe("completed");
    expect(lists[1].completedAt).not.toBeNull();
  });

  it("不存在的清单编号会抛错", () => {
    expect(() => completeStudyList(seed(5), 9, 1, 0)).toThrow("清单不存在");
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
