"use client";

import { useRef, useState } from "react";
import { Download, ShieldCheck, Trash2, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { downloadBackup, parseBackup } from "@/lib/backup";
import { clearDatabase, replaceDatabase } from "@/lib/store";
import type { AppDatabase } from "@/lib/types";
import { useAppData } from "@/lib/use-app-data";
import styles from "./data-backup.module.css";

type Pending = { kind: "import"; backup: AppDatabase } | { kind: "clear" };

export function DataBackup() {
  const data = useAppData();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const wordCount = data?.words.length ?? 0;
  /** 完成状态按单词记，这里报的是「练过多少个词」而不是清单数 */
  const practicedCount = data
    ? data.words.filter((word) => word.completedAt).length
    : 0;

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
      const backup = parseBackup(await file.text());
      setPending({ kind: "import", backup });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    }
  }

  function confirmPending() {
    if (!pending) return;

    if (pending.kind === "import") {
      replaceDatabase(pending.backup);
      setError("");
      setMessage(`已导入 ${pending.backup.words.length} 个单词。`);
    } else {
      clearDatabase();
      setError("");
      setMessage("已清空本浏览器里的数据。");
    }

    setPending(null);
  }

  const isImport = pending?.kind === "import";
  const importCount = pending?.kind === "import" ? pending.backup.words.length : 0;

  return (
    <section className={styles.backup} aria-labelledby="backup-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="backup-title">
          本地数据
        </h2>
      </div>

      <p className={styles.text}>
        换浏览器、换设备或清理站点数据后都看不到这份词库，导出备份是最稳妥的保险。
      </p>

      <div className={styles.stats}>
        <span className={styles.stat}>{wordCount} 个单词</span>
        <span className={styles.stat}>{practicedCount} 个词练过</span>
        <span className={`${styles.stat} ${styles.statSafe}`}>
          <ShieldCheck size={13} strokeWidth={1.8} />
          不上传任何服务器
        </span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={buttonClass({ variant: "ghost", size: "sm" })}
          onClick={handleExport}
          disabled={!data}
        >
          <Download size={15} strokeWidth={1.8} />
          导出备份
        </button>
        <button
          type="button"
          className={buttonClass({ variant: "ghost", size: "sm" })}
          onClick={() => inputRef.current?.click()}
          disabled={!data}
        >
          <Upload size={15} strokeWidth={1.8} />
          导入备份
        </button>
        <button
          type="button"
          className={`${buttonClass({ variant: "ghost", size: "sm" })} ${styles.danger}`}
          onClick={() => setPending({ kind: "clear" })}
          disabled={!data}
        >
          <Trash2 size={15} strokeWidth={1.8} />
          清空数据
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleImportFile(file);
          }}
        />
      </div>

      {(message || error) && (
        <p
          className={`${styles.status}${error ? ` ${styles.statusError}` : ""}`}
          role="status"
          aria-live="polite"
        >
          {error || message}
        </p>
      )}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={isImport ? "用备份覆盖现在词库？" : "清空这台设备上的数据？"}
        description={
          isImport
            ? `备份里有 ${importCount} 个单词。导入会覆盖当前浏览器中的全部数据，包括练习记录。`
            : "词库和练习记录都会消失，且无法恢复。清空之前建议先导出一份备份。"
        }
        initialFocus={cancelRef}
        footer={
          <>
            <button
              ref={cancelRef}
              type="button"
              className={buttonClass({ variant: "ghost" })}
              onClick={() => setPending(null)}
            >
              取消
            </button>
            <button
              type="button"
              className={buttonClass({
                variant: isImport ? "primary" : "danger",
              })}
              onClick={confirmPending}
            >
              {isImport ? "覆盖并导入" : "确认清空"}
            </button>
          </>
        }
      />
    </section>
  );
}
