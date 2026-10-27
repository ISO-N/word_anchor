"use client";

import { useRef, useState } from "react";
import { Download, HardDrive, ShieldCheck, Trash2, Upload } from "lucide-react";
import { downloadBackup, parseBackup } from "@/lib/backup";
import { clearDatabase, replaceDatabase } from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";

export function DataBackup() {
  const data = useAppData();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const wordCount = data?.words.length ?? 0;
  const completionCount = data ? Object.keys(data.completions).length : 0;

  function handleExport() {
    if (!data) return;
    setError("");
    setMessage("");
    downloadBackup(data);
    setMessage("已导出备份文件，记得放到你信任的位置。");
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setMessage("");

    try {
      const parsed = parseBackup(await file.text());
      const confirmed = window.confirm(
        `备份里有 ${parsed.words.length} 个单词。导入会覆盖当前浏览器中的全部数据，确定继续吗？`,
      );
      if (!confirmed) return;

      replaceDatabase(parsed);
      setMessage(`已导入 ${parsed.words.length} 个单词。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    }
  }

  function handleClear() {
    const confirmed = window.confirm(
      "清空后，本浏览器的词库和练习记录都会消失且无法恢复。确定清空吗？",
    );
    if (!confirmed) return;

    clearDatabase();
    setError("");
    setMessage("已清空本浏览器里的数据。");
  }

  return (
    <section className="data-backup" aria-label="本地数据管理">
      <div className="data-backup-main">
        <span className="data-backup-icon" aria-hidden="true">
          <HardDrive size={20} />
        </span>
        <div className="data-backup-copy">
          <strong>数据只存在这台设备的浏览器里</strong>
          <p>
            换浏览器、换设备或清理站点数据后都看不到这份词库，导出备份是最稳妥的保险。
          </p>
          <div className="data-backup-stats">
            <span>{wordCount} 个单词</span>
            <span>{completionCount} 份完成记录</span>
            <span className="data-backup-safe">
              <ShieldCheck size={13} />
              不上传任何服务器
            </span>
          </div>
        </div>
      </div>

      <div className="data-backup-actions">
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={handleExport}
          disabled={!data}
        >
          <Download size={15} />
          导出备份
        </button>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => inputRef.current?.click()}
          disabled={!data}
        >
          <Upload size={15} />
          导入备份
        </button>
        <button
          type="button"
          className="button button-ghost button-small data-backup-danger"
          onClick={handleClear}
          disabled={!data}
        >
          <Trash2 size={15} />
          清空数据
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleImportFile(file);
          }}
        />
      </div>

      {(message || error) && (
        <p className={`data-backup-status${error ? " is-error" : ""}`}>
          {error || message}
        </p>
      )}
    </section>
  );
}
