import { describe, expect, it } from "vitest";
import { formatClock, formatShortDate } from "@/lib/format";

describe("formatClock", () => {
  it("按 mm:ss 补零", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9)).toBe("00:09");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(60)).toBe("01:00");
    expect(formatClock(3599)).toBe("59:59");
    expect(formatClock(3600)).toBe("60:00");
  });

  it("负数与小数被收敛", () => {
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(61.9)).toBe("01:01");
  });
});

describe("formatShortDate", () => {
  it("固定按 Asia/Shanghai 输出，不受运行环境时区影响", () => {
    // 2026-01-05T18:30:00Z → 上海时间 1 月 6 日 02:30
    expect(formatShortDate("2026-01-05T18:30:00.000Z")).toContain("6");
    expect(formatShortDate("2026-01-05T18:30:00.000Z")).toContain("月");
  });
});
