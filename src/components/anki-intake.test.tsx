import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnkiIntake } from "@/components/anki-intake";
import { encodeInboxPayload } from "@/lib/intake";
import { clearDatabase, ensureLoaded, getSnapshot } from "@/lib/store";

/* App Router 的 Link 需要路由上下文，组件测试里退化成普通 <a> */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: unknown;
    children: React.ReactNode;
  }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(async () => {
  await ensureLoaded();
  clearDatabase();
  window.history.replaceState(null, "", "/");
});

describe("深链收录", () => {
  it("打开 #inbox= 链接就入库，并清掉地址栏里的 payload", async () => {
    const encoded = encodeInboxPayload([
      { term: "harbinger", meaning: "预兆" },
    ]);
    window.location.hash = `#inbox=${encoded}`;

    render(<AnkiIntake />);

    expect(await screen.findByText("已收录 1 个单词。")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(getSnapshot()?.words.map((word) => word.term)).toEqual([
      "harbinger",
    ]);
    expect(
      screen.getByRole("link", { name: /去练习最后一组/ }),
    ).toHaveAttribute("href", "/practice/?list=1");
  });

  it("同一个 payload 只处理一次", async () => {
    const encoded = encodeInboxPayload([{ term: "quaint", meaning: "古雅的" }]);
    window.location.hash = `#inbox=${encoded}`;

    render(<AnkiIntake />);
    await screen.findByText("已收录 1 个单词。");

    await act(async () => {
      window.location.hash = `#inbox=${encoded}`;
    });

    expect(getSnapshot()?.words).toHaveLength(1);
  });

  it("坏 payload 报可读的错误，也清掉地址栏", async () => {
    window.location.hash = "#inbox=!!!!";

    render(<AnkiIntake />);

    expect(await screen.findByText(/收录失败/)).toBeInTheDocument();
    expect(screen.getByText(/收录内容无法解码/)).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(getSnapshot()?.words).toHaveLength(0);
  });

  it("没有收录链接时什么都不渲染", () => {
    const { container } = render(<AnkiIntake />);

    expect(container).toBeEmptyDOMElement();
  });
});
