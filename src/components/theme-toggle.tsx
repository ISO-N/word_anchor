"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  applyTheme,
  getPreference,
  getServerPreference,
  resolveTheme,
  setPreference,
  subscribePreference,
  subscribeSystemTheme,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS = [
  { value: "auto", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
] as const satisfies ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: typeof Monitor;
}>;

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreference,
    getServerPreference,
  );

  /* 把偏好同步到 <html> 与 theme-color（外部系统，不是 React 状态） */
  useEffect(() => {
    applyTheme(resolveTheme(preference));
  }, [preference]);

  /* auto 时跟随系统变化 */
  useEffect(() => {
    if (preference !== "auto") return;
    return subscribeSystemTheme(() => applyTheme(resolveTheme("auto")));
  }, [preference]);

  return (
    <div className="segment-group" role="group" aria-label="主题">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className="segment"
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
