import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  save: vi.fn(),
  open: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
  isEnabled: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: tauri.save,
  open: tauri.open,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: tauri.writeTextFile,
  readTextFile: tauri.readTextFile,
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: tauri.isEnabled,
  enable: tauri.enable,
  disable: tauri.disable,
}));

import {
  checkHealth,
  getApiInfo,
  getAutostart,
  listInbox,
  onIntake,
  pickBackupText,
  removeInboxFile,
  saveBackupText,
  setAutostart,
} from "@/lib/desktop";
import { apiBaseUrl, isTauri } from "@/lib/platform";

beforeEach(() => {
  Object.values(tauri).forEach((mock) => mock.mockReset());
});

describe("Tauri 运行时探测", () => {
  it("jsdom 里没有 __TAURI_INTERNALS__，当作浏览器预览", () => {
    expect(isTauri()).toBe(false);
    expect(apiBaseUrl(8770)).toBe("http://127.0.0.1:8770");
  });

  it("注入 __TAURI_INTERNALS__ 后认作桌面端", () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    try {
      expect(isTauri()).toBe(true);
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});

describe("本地 API 命令", () => {
  it("端口、收件箱都走 command", async () => {
    tauri.invoke.mockResolvedValueOnce({ port: 8771 });
    await expect(getApiInfo()).resolves.toEqual({ port: 8771 });
    expect(tauri.invoke).toHaveBeenCalledWith("get_api_info");

    tauri.invoke.mockResolvedValueOnce([
      { path: "C:/inbox/01.json", payload: "{}" },
    ]);
    await expect(listInbox()).resolves.toHaveLength(1);
    expect(tauri.invoke).toHaveBeenCalledWith("inbox_list");

    tauri.invoke.mockResolvedValueOnce(null);
    await removeInboxFile("C:/inbox/01.json");
    expect(tauri.invoke).toHaveBeenCalledWith("inbox_remove", {
      path: "C:/inbox/01.json",
    });
  });

  it("事件名固定为 anki:intake，载荷就是文件路径", async () => {
    let received: string | null = null;
    const unlisten = vi.fn();
    tauri.listen.mockImplementationOnce(
      async (name: string, handler: (event: { payload: string }) => void) => {
        expect(name).toBe("anki:intake");
        handler({ payload: "C:/inbox/02.json" });
        return unlisten;
      },
    );

    const stop = await onIntake((path) => {
      received = path;
    });

    expect(received).toBe("C:/inbox/02.json");
    stop();
    expect(unlisten).toHaveBeenCalled();
  });

  it("health 检查成功、HTTP 错误与网络错误都有可读结果", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, app: "word-anchor", port: 8770 }),
      });
      await expect(checkHealth(8770)).resolves.toEqual({ ok: true, port: 8770 });
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8770/api/v1/health",
        expect.objectContaining({ cache: "no-store" }),
      );

      fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
      await expect(checkHealth(8770)).resolves.toEqual({
        ok: false,
        error: "HTTP 403",
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      });
      await expect(checkHealth(8770)).resolves.toEqual({
        ok: false,
        error: "返回内容不是词锚的 health 响应",
      });

      fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));
      await expect(checkHealth(8770)).resolves.toEqual({
        ok: false,
        error: "Failed to fetch",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("备份文件", () => {
  it("导出走系统另存为，再把文本写进去", async () => {
    tauri.save.mockResolvedValueOnce("D:/备份/word-anchor.json");
    tauri.writeTextFile.mockResolvedValueOnce(undefined);

    await expect(saveBackupText("{}", "word-anchor.json")).resolves.toBe(
      "D:/备份/word-anchor.json",
    );
    expect(tauri.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "word-anchor.json" }),
    );
    expect(tauri.writeTextFile).toHaveBeenCalledWith(
      "D:/备份/word-anchor.json",
      "{}",
    );
  });

  it("导出对话框取消时返回 null，且不写文件", async () => {
    tauri.save.mockResolvedValueOnce(null);

    await expect(saveBackupText("{}", "word-anchor.json")).resolves.toBeNull();
    expect(tauri.writeTextFile).not.toHaveBeenCalled();
  });

  it("导入走系统打开对话框并读回文本", async () => {
    tauri.open.mockResolvedValueOnce("D:/备份/old.json");
    tauri.readTextFile.mockResolvedValueOnce('{"app":"word-anchor"}');

    await expect(pickBackupText()).resolves.toEqual({
      path: "D:/备份/old.json",
      text: '{"app":"word-anchor"}',
    });
  });

  it("导入对话框取消时返回 null", async () => {
    tauri.open.mockResolvedValueOnce(null);

    await expect(pickBackupText()).resolves.toBeNull();
    expect(tauri.readTextFile).not.toHaveBeenCalled();
  });
});

describe("开机自启", () => {
  it("读状态与开关都转给插件", async () => {
    tauri.isEnabled.mockResolvedValueOnce(false);
    await expect(getAutostart()).resolves.toBe(false);

    await setAutostart(true);
    expect(tauri.enable).toHaveBeenCalled();

    await setAutostart(false);
    expect(tauri.disable).toHaveBeenCalled();
  });
});
