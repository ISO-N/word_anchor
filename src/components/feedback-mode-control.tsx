"use client";

import { useState } from "react";
import { CheckCheck, Zap } from "lucide-react";
import { updateFeedbackMode } from "@/lib/store";
import type { FeedbackMode } from "@/lib/types";
import { useAppData } from "@/lib/use-app-data";
import styles from "./feedback-mode-control.module.css";

const OPTIONS: { value: FeedbackMode; label: string; icon: typeof Zap }[] = [
  { value: "instant", label: "即时反馈", icon: Zap },
  { value: "manual", label: "手动判定", icon: CheckCheck },
];

type FeedbackModeControlProps = {
  /** inline：清单页设置项；compact：练习页顶部的紧凑切换 */
  variant?: "inline" | "compact";
};

/**
 * 反馈方式的唯一写入口。两个位置读同一份设置，
 * 因此清单页与练习页永远显示同一个值。
 */
export function FeedbackModeControl({
  variant = "inline",
}: FeedbackModeControlProps) {
  const data = useAppData();
  const [error, setError] = useState("");
  const mode = data?.settings.feedbackMode ?? "instant";

  function applyMode(nextMode: FeedbackMode) {
    setError("");

    try {
      updateFeedbackMode(nextMode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置失败");
    }
  }

  return (
    <div className={styles.control}>
      {variant === "inline" && <span className={styles.label}>判定方式</span>}

      <div className="segment-group" role="group" aria-label="反馈方式">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className="segment"
            aria-pressed={mode === value}
            onClick={() => applyMode(value)}
          >
            <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
