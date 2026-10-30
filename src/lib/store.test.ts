import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDatabase } from "@/lib/data";

const platform = vi.hoisted(() => ({ tauri: true }));

const sqlite = vi.hoisted(() => ({
  loadSnapshotFrom: vi.fn(),
  saveSnapshotTo: vi.fn(),
  openDatabase: vi.fn(),
}));

vi.mock("@/lib/platform", () => ({
  isTauri: () => platform.tauri,
  apiBaseUrl: (port: number) => `http://127.0.0.1:${port}`,
}));

vi.mock("@/lib/sqlite", () => sqlite);

beforeEach(() => {
  platform.tauri = true;
  sqlite.loadSnapshotFrom.mockReset();
  sqlite.saveSnapshotTo.mockReset();
  sqlite.openDatabase.mockReset();
  sqlite.openDatabase.mockResolvedValue({ select: vi.fn(), execute: vi.fn() });
  vi.resetModules();
});

describe("SQLite 持久层接线", () => {
  it("启动时从 SQLite 读回快照", async () => {
    const stored = {
      ...createEmptyDatabase(),
      words: [
        {
          id: 1,
          term: "lucid",
          meaning: "清晰易懂的",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          completedAt: null,
          lastCapturedAt: null,
          review: null,
        },
      ],
    };
    sqlite.loadSnapshotFrom.mockResolvedValue(stored);

    const store = await import("@/lib/store");
    await store.ensureLoaded();

    expect(store.getSnapshot()).toEqual(stored);
    expect(store.getPersistError()).toBeNull();
  });

  it("读取失败时报错，界面以空库继续，并且不把空库写回去", async () => {
    sqlite.loadSnapshotFrom.mockRejectedValue(new Error("数据库被占用"));

    const store = await import("@/lib/store");
    await store.ensureLoaded();

    expect(store.getSnapshot()).toEqual(createEmptyDatabase());
    expect(store.getPersistError()).toBe("数据库被占用");
    expect(sqlite.saveSnapshotTo).not.toHaveBeenCalled();
  });

  it("落盘失败上浮成 persistError，内存里的改动不丢", async () => {
    sqlite.loadSnapshotFrom.mockResolvedValue(createEmptyDatabase());
    sqlite.saveSnapshotTo.mockRejectedValue(new Error("磁盘已满"));

    const store = await import("@/lib/store");
    await store.ensureLoaded();
    store.addWord("lucid", "清晰易懂的");

    expect(store.getSnapshot()?.words.map((word) => word.term)).toEqual([
      "lucid",
    ]);
    await vi.waitFor(() => expect(store.getPersistError()).toBe("磁盘已满"));

    store.clearPersistError();
    expect(store.getPersistError()).toBeNull();
  });

  it("每次改动都把完整快照交给落盘层", async () => {
    sqlite.loadSnapshotFrom.mockResolvedValue(createEmptyDatabase());
    sqlite.saveSnapshotTo.mockResolvedValue(undefined);

    const store = await import("@/lib/store");
    await store.ensureLoaded();
    store.addWord("lucid", "清晰易懂的");
    store.addWord("vivid", "生动的");

    await vi.waitFor(() =>
      expect(sqlite.saveSnapshotTo).toHaveBeenCalledTimes(2),
    );
    const last = sqlite.saveSnapshotTo.mock.calls.at(-1)?.[1] as {
      words: { term: string }[];
    };
    expect(last.words.map((word) => word.term)).toEqual(["lucid", "vivid"]);
  });

  it("浏览器预览只跑内存，不打开数据库", async () => {
    platform.tauri = false;

    const store = await import("@/lib/store");
    await store.ensureLoaded();
    store.addWord("lucid", "清晰易懂的");

    expect(store.getSnapshot()?.words).toHaveLength(1);
    expect(sqlite.openDatabase).not.toHaveBeenCalled();
    expect(sqlite.loadSnapshotFrom).not.toHaveBeenCalled();
    expect(sqlite.saveSnapshotTo).not.toHaveBeenCalled();
  });
});
