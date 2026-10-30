/**
 * 主题偏好：auto / light / dark。
 *
 * 偏好必须能在首帧之前同步读出，因此用 localStorage 而不是数据库；
 * localStorage 被禁用时静默退回 auto，不影响应用本体。
 */

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "word-anchor:theme";

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f6f1e7",
  dark: "#171a17",
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

export function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function writePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* 隐私模式下写入失败：本次会话仍然生效 */
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "auto") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return preference;
}

function syncThemeColor(theme: ResolvedTheme): void {
  const color = THEME_COLORS[theme];
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.content = color;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  syncThemeColor(theme);
}

/** `auto` 时跟随系统；手动选择后不再跟随。 */
export function subscribeSystemTheme(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/* ---------- 偏好快照（供 useSyncExternalStore 使用） ---------- */

const listeners = new Set<() => void>();
let snapshot: ThemePreference = "auto";
let snapshotLoaded = false;

/** 服务端与 hydration 首帧固定返回 auto，之后才读 localStorage */
export function getServerPreference(): ThemePreference {
  return "auto";
}

export function getPreference(): ThemePreference {
  if (!snapshotLoaded) {
    snapshot = readPreference();
    snapshotLoaded = true;
  }
  return snapshot;
}

export function subscribePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPreference(preference: ThemePreference): void {
  snapshot = preference;
  snapshotLoaded = true;
  writePreference(preference);
  listeners.forEach((listener) => listener());
}

/**
 * 首帧前运行的小脚本：决定 data-theme 并同步 theme-color，
 * 因此任何主题下刷新都不会闪白。
 */
export const THEME_INIT_SCRIPT = [
  "(function(){try{",
  `var k=${JSON.stringify(THEME_STORAGE_KEY)};`,
  "var p=window.localStorage.getItem(k);",
  'if(p!=="light"&&p!=="dark")p="auto";',
  `var t=p==="auto"?(window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light"):p;`,
  "var r=document.documentElement;",
  "r.dataset.theme=t;",
  `var c=t==="dark"?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)};`,
  'var m=document.querySelector(\'meta[name="theme-color"]\');',
  'if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);}',
  'm.setAttribute("content",c);',
  "}catch(e){}})();",
].join("");
