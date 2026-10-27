import { describe, expect, it } from "vitest";
import { curvePath } from "@/lib/geometry";

describe("curvePath", () => {
  it("从起点出发、在终点结束", () => {
    const path = curvePath({ x: 100, y: 40 }, { x: 300, y: 90 });

    expect(path.startsWith("M 100 40")).toBe(true);
    expect(path.endsWith("300 90")).toBe(true);
  });

  it("水平距离不足时使用最小弯曲量，避免曲线压成直线", () => {
    const path = curvePath({ x: 0, y: 0 }, { x: 10, y: 10 });

    expect(path).toBe("M 0 0 C 36 0, -26 10, 10 10");
  });

  it("零距离与负向距离都不会产生 NaN", () => {
    expect(curvePath({ x: 5, y: 5 }, { x: 5, y: 5 })).not.toContain("NaN");
    expect(curvePath({ x: 200, y: 0 }, { x: 0, y: 100 })).not.toContain("NaN");
  });
});
