import { describe, expect, it } from "vitest";
import {
  WIRE_PREFIX,
  decodeInboxPayload,
  describeIntake,
  encodeInboxPayload,
  extractInboxHash,
  parseIntakeText,
} from "@/lib/intake";
import type { IntakeEntry, IntakeSummary } from "@/lib/types";

const ENTRIES: IntakeEntry[] = [
  { term: "serendipity", meaning: "意外发现珍奇事物的本领" },
  { term: "lucid", meaning: "清晰易懂的" },
];

/** 测试内部用：把任意 JSON 编成 base64url，用来构造「坏 payload」 */
function rawPayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function summaryOf(partial: Partial<IntakeSummary>): IntakeSummary {
  return { added: [], duplicates: [], rejected: [], ...partial };
}

describe("深链 payload", () => {
  it("编码 → 解码后内容完全不丢", () => {
    const decoded = decodeInboxPayload(encodeInboxPayload(ENTRIES));

    expect(decoded.entries).toEqual(ENTRIES);
    expect(decoded.rejected).toEqual([]);
  });

  it("编码结果只含 URL 安全字符，也没有 padding", () => {
    /* 这几个字在标准 base64 里会同时逼出 + 和 / */
    const payload = encodeInboxPayload([
      { term: "亯亯", meaning: "丿丿丿" },
    ]);

    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload).not.toContain("=");
    expect(decodeInboxPayload(payload).entries).toEqual([
      { term: "亯亯", meaning: "丿丿丿" },
    ]);
  });

  it("emoji 与中文都能往返", () => {
    const entries: IntakeEntry[] = [
      { term: "naïve", meaning: "天真的 🍀" },
      { term: "schadenfreude", meaning: "幸灾乐祸\n第二行" },
    ];

    expect(decodeInboxPayload(encodeInboxPayload(entries)).entries).toEqual(
      entries,
    );
  });

  it("空值、乱码、非 JSON 都报可读的中文错误", () => {
    expect(() => decodeInboxPayload("   ")).toThrow("链接里没有收录内容");
    expect(() => decodeInboxPayload("!!!!")).toThrow("收录内容无法解码");
    expect(() => decodeInboxPayload("aGVsbG8")).toThrow("收录内容无法解码");
  });

  it("版本不符时提示更新页面", () => {
    expect(() =>
      decodeInboxPayload(rawPayload({ v: 2, words: ENTRIES })),
    ).toThrow("收录内容的版本不受支持");
  });

  it("没有单词与超过 200 条都会被拦下", () => {
    expect(() => decodeInboxPayload(rawPayload({ v: 1, words: [] }))).toThrow(
      "链接里没有可收录的单词",
    );

    const tooMany = Array.from({ length: 201 }, (_unused, index) => ({
      term: `word-${index}`,
      meaning: "释义",
    }));
    expect(() => decodeInboxPayload(encodeInboxPayload(tooMany))).toThrow(
      "一次最多收录 200 个单词",
    );
  });

  it("超长 payload 直接拒绝，而不是截断", () => {
    expect(() => decodeInboxPayload("a".repeat(12001))).toThrow(
      "这次要收录的内容太多了",
    );
  });

  it("单条形状不对只算一条失败，不连坐整批", () => {
    const decoded = decodeInboxPayload(
      rawPayload({
        v: 1,
        words: [{ term: "lucid", meaning: "清晰易懂的" }, { meaning: "没有单词" }, "string"],
      }),
    );

    expect(decoded.entries).toEqual([{ term: "lucid", meaning: "清晰易懂的" }]);
    expect(decoded.rejected).toHaveLength(2);
    expect(decoded.rejected[0].reason).toBe("格式无法识别");
  });

  it("缺少释义时保留这一条，交给入库阶段报「释义为空」", () => {
    const decoded = decodeInboxPayload(
      rawPayload({ v: 1, words: [{ term: "lucid" }] }),
    );

    expect(decoded.entries).toEqual([{ term: "lucid", meaning: "" }]);
  });
});

describe("location.hash", () => {
  it("只认 #inbox=", () => {
    expect(extractInboxHash("#inbox=abc")).toBe("abc");
    expect(extractInboxHash("#inbox=")).toBeNull();
    expect(extractInboxHash("#other=abc")).toBeNull();
    expect(extractInboxHash("")).toBeNull();
  });
});

describe("粘贴框解析", () => {
  it("认得插件写的信封，并容忍 CRLF 与前后空白", () => {
    const encoded = encodeInboxPayload(ENTRIES);
    const parsed = parseIntakeText(
      `  ${WIRE_PREFIX.toUpperCase()}  \r\n${encoded}\r\n  `,
    );

    expect(parsed.entries).toEqual(ENTRIES);
  });

  it("信封里没有 payload 时要求重新复制", () => {
    expect(() => parseIntakeText(`${WIRE_PREFIX}\n  \n`)).toThrow(
      "收录内容不完整",
    );
  });

  it("认得 Anki 插件（Python）真正产出的信封", () => {
    /* 由 anki-addon/word_anchor_sync/wire.py 生成，用来锁住两端的契约 */
    const envelope = [
      WIRE_PREFIX,
      "eyJ2IjoxLCJzb3VyY2UiOiJhbmtpIiwid29yZHMiOlt7InRlcm0iOiJsdWNpZCIsIm1lYW5pbmciOiLmuIXmmbDmmJPmh4LnmoQifSx7InRlcm0iOiJzZXJlbmRpcGl0eSIsIm1lYW5pbmciOiLmhI_lpJblj5HnjrDnj43lpYfkuovniannmoTmnKzpooYifV19",
    ].join("\n");

    expect(parseIntakeText(envelope).entries).toEqual([
      { term: "lucid", meaning: "清晰易懂的" },
      { term: "serendipity", meaning: "意外发现珍奇事物的本领" },
    ]);
  });

  it("普通文本按第一个 Tab 切成单词与释义", () => {
    const parsed = parseIntakeText(
      "lucid\t清晰易懂的\n\ncandid\t坦率的\tsubtle\n",
    );

    expect(parsed.entries).toEqual([
      { term: "lucid", meaning: "清晰易懂的" },
      { term: "candid", meaning: "坦率的\tsubtle" },
    ]);
    expect(parsed.rejected).toEqual([]);
  });

  it("没有 Tab 的行进 rejected，不静默丢掉", () => {
    const parsed = parseIntakeText("lucid 清晰易懂的\nvivid\t生动的");

    expect(parsed.entries).toEqual([{ term: "vivid", meaning: "生动的" }]);
    expect(parsed.rejected).toEqual([
      { term: "lucid 清晰易懂的", reason: "这一行缺少 Tab 分隔" },
    ]);
  });

  it("空输入什么都不返回", () => {
    expect(parseIntakeText("   \n\n ")).toEqual({ entries: [], rejected: [] });
  });
});

describe("收录结果文案", () => {
  it("新增、跳过、失败按同一套口径报数", () => {
    expect(
      describeIntake(
        summaryOf({
          added: [
            { id: 1, term: "a", meaning: "b", createdAt: "", updatedAt: "" },
            { id: 2, term: "c", meaning: "d", createdAt: "", updatedAt: "" },
          ],
          duplicates: ["e"],
        }),
      ),
    ).toBe("已收录 2 个单词，跳过 1 个已在词库中。");

    expect(describeIntake(summaryOf({ duplicates: ["a", "b", "c"] }))).toBe(
      "这 3 个单词都已在词库中，没有新增。",
    );

    expect(
      describeIntake(
        summaryOf({
          rejected: [{ term: "x", reason: "释义为空" }],
        }),
      ),
    ).toBe("没有收录到单词，1 条无法收录。");
  });
});
