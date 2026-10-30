import { apiBaseUrl, isTauri } from "@/lib/platform";

/**
 * 桌面端能力的唯一入口：Tauri command / 事件 / 系统对话框 / 开机自启。
 *
 * 全部按需 `import()`：浏览器预览与 jsdom 单测里这些包不应该被加载，
 * 更不应该尝试连 IPC。需要模拟桌面端的测试直接 `vi.mock("@/lib/desktop")`。
 */

export { isTauri };

/** `get_api_info` 的返回：端口还没绑定时为 null */
export type ApiInfo = { port: number | null };

export type InboxItem = { path: string; payload: string };

export type HealthReport =
  | { ok: true; port: number }
  | { ok: false; error: string };

export async function getApiInfo(): Promise<ApiInfo> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ApiInfo>("get_api_info");
}

/** 收件箱里所有待收录的 payload（按到达时间排序） */
export async function listInbox(): Promise<InboxItem[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<InboxItem[]>("inbox_list");
}

/** 收录成功后删掉那一条 */
export async function removeInboxFile(path: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("inbox_remove", { path });
}

/** 订阅 `anki:intake`；返回取消订阅函数 */
export async function onIntake(
  listener: (path: string) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("anki:intake", (event) => listener(event.payload));
}

/** 设置页「测试连接」：真的走一次 HTTP，确认插件能连上 */
export async function checkHealth(port: number): Promise<HealthReport> {
  try {
    const response = await fetch(`${apiBaseUrl(port)}/api/v1/health`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      (body as { ok?: unknown }).ok === true
    ) {
      return { ok: true, port };
    }

    return { ok: false, error: "返回内容不是词锚的 health 响应" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "连接失败",
    };
  }
}

/** 系统「另存为」对话框写备份；用户取消时返回 null */
export async function saveBackupText(
  text: string,
  fileName: string,
): Promise<string | null> {
  const [{ save }, { writeTextFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);

  const path = await save({
    title: "导出词锚备份",
    defaultPath: fileName,
    filters: [{ name: "JSON 备份", extensions: ["json"] }],
  });
  if (!path) return null;

  await writeTextFile(path, text);
  return path;
}

/** 系统「打开」对话框读备份；用户取消时返回 null */
export async function pickBackupText(): Promise<{
  path: string;
  text: string;
} | null> {
  const [{ open }, { readTextFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);

  const selected = await open({
    title: "导入词锚备份",
    multiple: false,
    directory: false,
    filters: [{ name: "JSON 备份", extensions: ["json"] }],
  });
  if (!selected || typeof selected !== "string") return null;

  return { path: selected, text: await readTextFile(selected) };
}

export async function getAutostart(): Promise<boolean> {
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function setAutostart(enabled: boolean): Promise<void> {
  const plugin = await import("@tauri-apps/plugin-autostart");
  await (enabled ? plugin.enable() : plugin.disable());
}
