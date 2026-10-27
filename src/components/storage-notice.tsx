"use client";

import { AlertTriangle, X } from "lucide-react";
import { clearPersistError } from "@/lib/store";
import { usePersistError } from "@/lib/use-app-data";

export function StorageNotice() {
  const error = usePersistError();

  if (!error) return null;

  return (
    <div className="storage-notice" role="alert">
      <span className="storage-notice-icon" aria-hidden="true">
        <AlertTriangle size={17} />
      </span>
      <div>
        <strong>本地保存失败</strong>
        <p>{error}。为避免丢失，请到「单词库」页导出备份。</p>
      </div>
      <button
        type="button"
        className="icon-button icon-button-small"
        onClick={clearPersistError}
        aria-label="关闭提示"
      >
        <X size={15} />
      </button>
    </div>
  );
}
