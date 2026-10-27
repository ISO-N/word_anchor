import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { setPreference, THEME_STORAGE_KEY } from "@/lib/theme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    setPreference("auto");
  });

  it("默认跟随系统，三个选项都带 aria-pressed", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("group", { name: "主题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跟随系统" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("选择深色会写入 localStorage 并切换 data-theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "深色" }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("选择浅色后即使系统偏好暗色也保持浅色", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "浅色" }));

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("light"),
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("主题色 meta 与当前主题同步", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "深色" }));

    await waitFor(() =>
      expect(
        document
          .querySelector('meta[name="theme-color"]')
          ?.getAttribute("content"),
      ).toBe("#171a17"),
    );
  });
});
