import { describe, expect, it } from "vitest";
import { normalizeDatabase, parseBackup, serializeBackup } from "@/lib/backup";
import {
  createEmptyDatabase,
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
