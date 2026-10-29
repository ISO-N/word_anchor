"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, ClipboardPaste, Inbox } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { getListOverview } from "@/lib/data";
import { describeIntake, parseIntakeText } from "@/lib/intake";
import { getSnapshot, intakeWords } from "@/lib/store";
import type { IntakeSummary } from "@/lib/types";
import { useAppData } from "@/lib/use-app-data";
import styles from "./word-intake.module.css";

/** 浏览器能力只能用外部快照读：服务端渲染时一律当作不可用，hydration 后再切真值 */
const noSubscribe = () => () => {};
const canReadClipboardOnServer = () => false;

function canReadClipboardOnClient(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.readText === "function"
  );
}

/**
 * Anki → 词锚的第二个入口：把插件复制到剪贴板的那段文本粘进来自动入库。
 * 与深链共用 `parseIntakeText` / `intakeWords`，只是通道不同。
 */
export function WordIntake() {
  const data = useAppData();
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<IntakeSummary | null>(null);
  const [listIndex, setListIndex] = useState<number | null>(null);
  const [error, setError] = useState("");

  const canReadClipboard = useSyncExternalStore(
    noSubscribe,
    canReadClipboardOnClient,
    canReadClipboardOnServer,
  );

  function run(raw: string) {
    try {
      const parsed = parseIntakeText(raw);

      if (parsed.entries.length === 0 && parsed.rejected.length === 0) {
        setSummary(null);
        setError("没有读到可以收录的内容。");
        return;
      }

      const result = intakeWords(parsed);
      const snapshot = getSnapshot();
      const lists = snapshot ? getListOverview(snapshot).lists : [];

      setSummary(result);
      setListIndex(lists.length > 0 ? lists[lists.length - 1].index : null);
      setError("");
      setText("");
    } catch (caught) {
      setSummary(null);
      setError(caught instanceof Error ? caught.message : "收录失败");
    }
  }

  async function handleClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        setSummary(null);
        setError("剪贴板是空的。");
        return;
      }
      run(clip);
    } catch {
      setSummary(null);
      setError("读不到剪贴板，请点输入框手动粘贴（Ctrl+V）。");
    }
  }

  const requeuedPreview = useMemo(() => {
    if (!summary || summary.requeued.length === 0) return "";
    const shown = summary.requeued.slice(0, 5).join("、");
    return summary.requeued.length > 5
      ? `${shown} 等 ${summary.requeued.length} 个`
      : shown;
  }, [summary]);

  const duplicatePreview = useMemo(() => {
    if (!summary || summary.duplicates.length === 0) return "";
    const shown = summary.duplicates.slice(0, 5).join("、");
    return summary.duplicates.length > 5
      ? `${shown} 等 ${summary.duplicates.length} 个`
      : shown;
  }, [summary]);

  const rejectedPreview = useMemo(() => {
    if (!summary || summary.rejected.length === 0) return "";

    const counts = new Map<string, number>();
    summary.rejected.forEach((item) => {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([reason, count]) => `${reason} ×${count}`)
      .join("、");
  }, [summary]);

  return (
    <section className={styles.intake} aria-labelledby="intake-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="intake-title">
          从 Anki 快速收录
        </h2>
        <span className={styles.badge}>重来即收</span>
      </div>

      <p className={styles.text}>
        Anki 里装了「词锚同步」后，复习时按<strong>重来</strong>就会把单词和释义攒进队列；回到这里点「从剪贴板收录」，或者在 Anki 里直接打开收录链接。
      </p>

      <label className="sr-only" htmlFor="intake-text">
        Anki 收录内容
      </label>
      <textarea
        id="intake-text"
        className={styles.textarea}
        rows={3}
        spellCheck={false}
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={"在 Anki 里点「复制到剪贴板」，然后粘贴到这里…"}
      />

      <div className={styles.actions}>
        {canReadClipboard && (
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={() => void handleClipboard()}
            disabled={!data}
          >
            <ClipboardPaste size={15} strokeWidth={1.8} aria-hidden="true" />
            从剪贴板收录
          </button>
        )}
        <button
          type="button"
          className={buttonClass({ size: "sm" })}
          onClick={() => run(text)}
          disabled={!data || text.trim().length === 0}
        >
          <Inbox size={15} strokeWidth={1.8} aria-hidden="true" />
          收录
        </button>
      </div>

      {error && (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {error}
        </p>
      )}

      {summary && (
        <div className={styles.result} role="status">
          <p className={styles.status}>{describeIntake(summary)}</p>

          {requeuedPreview && (
            <p className={styles.detail}>
              已排到队尾（最后一组会再练一次）：{requeuedPreview}
            </p>
          )}
          {duplicatePreview && (
            <p className={styles.detail}>已在词库中：{duplicatePreview}</p>
          )}
          {rejectedPreview && (
            <p className={styles.detail}>无法收录：{rejectedPreview}</p>
          )}

          {listIndex !== null && (
            <Link className="text-link" href={`/practice/?list=${listIndex}`}>
              去练习最后一组
              <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
