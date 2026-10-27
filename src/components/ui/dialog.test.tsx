import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/components/ui/dialog";

function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <main id="main-content">
        <button type="button" onClick={() => setOpen(true)}>
          打开
        </button>
      </main>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="删除这个单词？"
        description="它会被移除。"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)}>
              取消
            </button>
            <button type="button">确认删除</button>
          </>
        }
      />
    </>
  );
}

describe("Dialog", () => {
  it("打开后带上对话框语义并聚焦第一个操作", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "打开" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("删除这个单词？");
    expect(dialog).toHaveAccessibleDescription("它会被移除。");
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());
  });

  it("把背景内容隔离成 inert，并锁定页面滚动", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "打开" }));

    expect(document.querySelector("#main-content")).toHaveProperty("inert", true);
    expect(document.body.style.overflow).toBe("hidden");
    // 对话框本身（portal 到 body）不在被隔离的范围内
    expect(screen.getByRole("dialog")).toHaveProperty("inert", false);
  });

  it("Esc 关闭并把焦点还给触发元素", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "打开" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.querySelector("#main-content")).toHaveProperty("inert", false);
    expect(document.body.style.overflow).toBe("");
  });

  it("Tab 在对话框内部循环，不会跑到背景页面", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "打开" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());

    const confirm = screen.getByRole("button", { name: "确认删除" });
    confirm.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});
