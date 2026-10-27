"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureLoaded,
  getPersistError,
  getSnapshot,
  subscribe,
} from "@/lib/store";
import type { AppDatabase } from "@/lib/types";

const getServerSnapshot = () => null;

/**
 * 读取浏览器本地词库。首次渲染（预渲染 / hydration 阶段）返回 null，
 * 客户端加载完成后自动切换为真实数据，避免 hydration 不匹配。
 */
export function useAppData(): AppDatabase | null {
  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void ensureLoaded();
  }, []);

  return data;
}

export function usePersistError(): string | null {
  return useSyncExternalStore(subscribe, getPersistError, getServerSnapshot);
}
