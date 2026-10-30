"use client";

import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { clearPersistError } from "@/lib/store";
import { usePersistError } from "@/lib/use-app-data";
import styles from "./storage-notice.module.css";

export function StorageNotice() {
  const error = usePersistError();

  if (!error) return null;

  return (
    <div className="shell">
      <div className={styles.notice} role="alert">
        <AlertTriangle className={styles.icon} size={18} strokeWidth={1.8} />
        <p className={styles.text}>
          <strong>本地保存失败。</strong>
          {error}。词库现在只在内存里，关掉窗口就会丢；请到{" "}
          <Link href="/words">单词库</Link> 导出备份。
        </p>
        <button
          type="button"
          className={styles.close}
          onClick={clearPersistError}
          aria-label="关闭提示"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
