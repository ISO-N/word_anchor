import { describe, expect, it } from "vitest";
import {
  MAX_BODY_BYTES,
  MAX_ENTRIES,
  describeIntake,
  encodeIntakeBody,
  parseIntakeBody,
} from "@/lib/intake";
import type { IntakeEntry, IntakeSummary } from "@/lib/types";

const ENTRIES: IntakeEntry[] = [
  { term: "serendipity", meaning: "意外发现珍奇事物的本领" },
  { term: "lucid", meaning: "清晰易懂的" },
];

/**
 * 与插件 `wire.py` / Rust `api.rs` 共用的 fixture：
 * 三边都必须能产出、也能解析这一模一样的字符串。
 */
const SHARED_WIRE_BODY =
  '{"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的"},{"term":"serendipity","meaning":"意外发现珍奇事物的本领"}]}';

function summaryOf(partial: Partial<IntakeSummary>): IntakeSummary {
  return { added: [], duplicates: [], requeued: [], rejected: [], ...partial };
}

function word(term: string, id = 1) {
  return {
    id,
    term,
    meaning: "释义",
    createdAt: "",
    updatedAt: "",
    completedAt: null,
  };
}

describe("wire v1 JSON body", () => {
  it("编码 → 解析后内容完全不丢", () => {
    const parsed = parseIntakeBody(encodeIntakeBody(ENTRIES));

    expect(parsed.entries).toEqual(ENTRIES);
    expect(parsed.rejected).toEqual([]);
  });

  it("产出的字节与插件、Rust 侧的 fixture 完全一致", () => {
    expect(
      encodeIntakeBody([
        { term: "lucid", meaning: "清晰易懂的" },
        { term: "serendipity", meaning: "意外发现珍奇事物的本领" },
      ]),
    ).toBe(SHARED_WIRE_BODY);

    expect(parseIntakeBody(SHARED_WIRE_BODY).entries).toEqual([
      { term: "lucid", meaning: "清晰易懂的" },
      { term: "serendipity", meaning: "意外发现珍奇事物的本领" },
    ]);
  });

  it("emoji 与中文都能往返", () => {
    const entries: IntakeEntry[] = [
      { term: "naïve", meaning: "天真的 🍀" }, // 用户输入的释义内容，不是界面图标 taste-skill-ignore
      { term: "schadenfreude", meaning: "幸灾乐祸\n第二行" },
    ];

    expect(parseIntakeBody(encodeIntakeBody(entries)).entries).toEqual(entries);
  });

  it("空内容、非法 JSON、非对象都报可读的中文错误", () => {
    expect(() => parseIntakeBody("   ")).toThrow("收件箱里的内容是空的");
    expect(() => parseIntakeBody("{")).toThrow("收录内容无法解码");
    expect(() => parseIntakeBody("[]")).toThrow("收录内容无法解码");
    expect(() => parseIntakeBody('"nope"')).toThrow("收录内容无法解码");
  });

  it("版本或来源不对时拒绝整批", () => {
    expect(() =>
      parseIntakeBody(JSON.stringify({ v: 2, source: "anki", words: ENTRIES })),
    ).toThrow("版本不受支持");

    expect(() =>
      parseIntakeBody(JSON.stringify({ v: 1, source: "web", words: ENTRIES })),
    ).toThrow("来源不受支持");
  });

  it("没有单词与超过 200 条都会被拦下", () => {
    expect(() =>
      parseIntakeBody(JSON.stringify({ v: 1, source: "anki", words: [] })),
    ).toThrow("没有可收录的单词");

    const tooMany = Array.from({ length: MAX_ENTRIES + 1 }, (_unused, index) => ({
      term: `word-${index}`,
      meaning: "释义",
    }));
    expect(() =>
      parseIntakeBody(JSON.stringify({ v: 1, source: "anki", words: tooMany })),
    ).toThrow(`一次最多收录 ${MAX_ENTRIES} 个单词`);
  });

  it("超过 512KB 直接拒绝，而不是截断", () => {
    const huge = JSON.stringify({
      v: 1,
      source: "anki",
      words: [{ term: "lucid", meaning: "a".repeat(MAX_BODY_BYTES) }],
    });

    expect(() => parseIntakeBody(huge)).toThrow("内容太多了");
  });

  it("单条形状不对只算一条失败，不连坐整批", () => {
    const parsed = parseIntakeBody(
      JSON.stringify({
        v: 1,
        source: "anki",
        words: [
          { term: "lucid", meaning: "清晰易懂的" },
          { meaning: "没有单词" },
          "string",
        ],
      }),
    );

    expect(parsed.entries).toEqual([{ term: "lucid", meaning: "清晰易懂的" }]);
    expect(parsed.rejected).toHaveLength(2);
    expect(parsed.rejected[0].reason).toBe("格式无法识别");
  });

  it("缺少释义时保留这一条，交给入库阶段报「释义为空」", () => {
    const parsed = parseIntakeBody(
      JSON.stringify({ v: 1, source: "anki", words: [{ term: "lucid" }] }),
    );

    expect(parsed.entries).toEqual([{ term: "lucid", meaning: "" }]);
  });

  it("抓取时间随条目往返，缺失或类型不对时干脆不带这个字段", () => {
    const entries: IntakeEntry[] = [
      {
        term: "lucid",
        meaning: "清晰易懂的",
        capturedAt: "2024-05-01T09:00:00.000+00:00",
      },
    ];

    expect(parseIntakeBody(encodeIntakeBody(entries)).entries).toEqual(entries);

    const parsed = parseIntakeBody(
      JSON.stringify({
        v: 1,
        source: "anki",
        words: [
          { term: "lucid", meaning: "清晰易懂的", capturedAt: 42 },
          { term: "vivid", meaning: "生动的", capturedAt: "" },
        ],
      }),
    );

    expect(parsed.entries).toEqual([
      { term: "lucid", meaning: "清晰易懂的" },
      { term: "vivid", meaning: "生动的" },
    ]);
    expect(parsed.rejected).toEqual([]);
  });

  it("编码超长字段时截断到 wire 上限", () => {
    const body = encodeIntakeBody([
      { term: "a".repeat(90), meaning: "义".repeat(320) },
    ]);
    const parsed = parseIntakeBody(body);

    expect(parsed.entries[0].term).toHaveLength(80);
    expect(parsed.entries[0].meaning).toHaveLength(300);
  });
});

describe("收录结果文案", () => {
  it("新增、跳过、失败按同一套口径报数", () => {
    expect(
      describeIntake(summaryOf({ added: [word("a", 1), word("c", 2)], duplicates: ["e"] })),
    ).toBe("已收录 2 个单词，跳过 1 个已在词库中。");

    expect(describeIntake(summaryOf({ duplicates: ["a", "b", "c"] }))).toBe(
      "这 3 个单词都已在词库中，没有新增。",
    );

    expect(
      describeIntake(summaryOf({ rejected: [{ term: "x", reason: "释义为空" }] })),
    ).toBe("没有收录到单词，1 条无法收录。");
  });

  it("重排的词单独报数，也能和新增、跳过一起出现", () => {
    expect(describeIntake(summaryOf({ requeued: ["a", "b"] }))).toBe(
      "2 个单词重新排到了队尾。",
    );

    expect(
      describeIntake(summaryOf({ requeued: ["a"], duplicates: ["b", "c"] })),
    ).toBe("1 个单词重新排到了队尾，跳过 2 个已在词库中。");

    expect(
      describeIntake(
        summaryOf({
          added: [word("a")],
          requeued: ["d"],
          rejected: [{ term: "x", reason: "释义为空" }],
        }),
      ),
    ).toBe("已收录 1 个单词，1 个单词重新排到了队尾，1 条无法收录。");
  });
});
