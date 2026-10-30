import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopPanel } from "@/components/desktop-panel";

const desktop = vi.hoisted(() => ({
  tauri: false,
  port: 8771 as number | null,
  healthOk: true,
  autostart: false,
}));

vi.mock("@/lib/desktop", () => ({
  isTauri: () => desktop.tauri,
  getApiInfo: vi.fn(async () => ({ port: desktop.port })),
  checkHealth: vi.fn(async (port: number) =>
    desktop.healthOk
      ? { ok: true as const, port }
      : { ok: false as const, error: "连接被拒绝" },
  ),
  getAutostart: vi.fn(async () => desktop.autostart),
  setAutostart: vi.fn(async (enabled: boolean) => {
    desktop.autostart = enabled;
  }),
}));

beforeEach(() => {
  desktop.tauri = false;
  desktop.port = 8771;
  desktop.healthOk = true;
  desktop.autostart = false;
});

describe("桌面端设置区", () => {
  it("浏览器预览里只说明数据不会保存", async () => {
    render(<DesktopPanel />);

    expect(screen.getByText("浏览器预览")).toBeInTheDocument();
    expect(
      screen.getByText(/刷新即清空/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /测试连接/ })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("桌面端显示接口地址、能测连接、能开自启", async () => {
    desktop.tauri = true;
    render(<DesktopPanel />);

    expect(await screen.findByText("http://127.0.0.1:8771")).toBeInTheDocument();
    expect(screen.getByText("本地接口已就绪")).toBeInTheDocument();

    const testButton = screen.getByRole("button", { name: /测试连接/ });
    await userEvent.click(testButton);

    expect(
      await screen.findByText("连接正常：词锚在 127.0.0.1:8771 应答。"),
    ).toBeInTheDocument();

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveTextContent("开机自启：关");

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveTextContent("开机自启：开");
  });

  it("连接失败时给出可读原因", async () => {
    desktop.tauri = true;
    desktop.healthOk = false;
    render(<DesktopPanel />);

    await userEvent.click(
      await screen.findByRole("button", { name: /测试连接/ }),
    );

    expect(
      await screen.findByText("连接失败：连接被拒绝"),
    ).toBeInTheDocument();
  });

  it("端口还没绑定时显示启动中，测试连接不可点", async () => {
    desktop.tauri = true;
    desktop.port = null;
    render(<DesktopPanel />);

    expect(await screen.findByText("启动中…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /测试连接/ })).toBeDisabled();
    expect(screen.getByText("本地接口启动中")).toBeInTheDocument();
  });
});
