import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_COLORS } from "@/lib/theme";

/**
 * 首帧的底色由内联脚本按 `THEME_COLORS` 决定，之后由 `tokens.css` 接上。
 * 两边一旦不一致，每次刷新都会先闪一下另一个颜色——所以让测试盯着它。
 */
describe("主题色与 token 保持一致", () => {
  const tokens = readFileSync(
    resolve(process.cwd(), "src/styles/tokens.css"),
    "utf8",
  );
  const papers = [...tokens.matchAll(/--paper:\s*(#[0-9a-fA-F]{6})/g)].map(
    (match) => match[1].toLowerCase(),
  );

  it("两套主题各有一份 --paper", () => {
    expect(papers).toHaveLength(2);
  });

  it("THEME_COLORS 与 --paper 相等", () => {
    expect(papers[0]).toBe(THEME_COLORS.light.toLowerCase());
    expect(papers[1]).toBe(THEME_COLORS.dark.toLowerCase());
  });
});
