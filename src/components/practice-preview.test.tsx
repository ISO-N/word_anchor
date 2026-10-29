import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticePreview } from "@/components/practice-preview";
import type { WordRecord } from "@/lib/types";

const WORDS: WordRecord[] = [
  {
    id: 1,
    term: "serendipity",
    meaning: "意外的好运",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    completedAt: null,
  },
  {
    id: 2,
    term: "lucid",
    meaning: "清晰易懂的",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    completedAt: null,
  },
  {
    id: 3,
    term: "anchor",
    meaning: "锚；使固定",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    completedAt: null,
  },
];

describe("首页板面预览", () => {
  it("只摆出单词，不提前露出释义", () => {
    const { container } = render(<PracticePreview words={WORDS} />);

    WORDS.forEach((word) => {
      expect(screen.getByText(word.term)).toBeInTheDocument();
      expect(screen.queryByText(word.meaning)).toBeNull();
    });

    expect(screen.getByText("释义会在开始练习后出现")).toBeInTheDocument();

    /* 每行的右列是一块不参与读屏的虚线留白 */
    const blanks = container.querySelectorAll('li span[aria-hidden="true"]');
    expect(blanks).toHaveLength(WORDS.length);
  });
});
