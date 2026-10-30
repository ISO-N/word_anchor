"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { MAX_LIST_SIZE, MIN_LIST_SIZE } from "@/lib/data";
import { updateListSize } from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";
import styles from "./list-size-control.module.css";

const PRESETS = [4, 6, 8, 10];

export function ListSizeControl() {
  const data = useAppData();
  const [error, setError] = useState("");
  const size = data?.settings.listSize ?? MIN_LIST_SIZE;

  function applySize(nextSize: number) {
    if (nextSize < MIN_LIST_SIZE || nextSize > MAX_LIST_SIZE) return;
    setError("");

    try {
      updateListSize(nextSize);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置失败");
    }
  }

  return (
    <div className={styles.control}>
      <span className={styles.label}>每组单词数</span>

      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.step}
          onClick={() => applySize(size - 1)}
          disabled={size <= MIN_LIST_SIZE}
          aria-label="减少每组单词数"
        >
          <Minus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        <span className={styles.value} aria-live="polite">
          {size}
        </span>
        <button
          type="button"
          className={styles.step}
          onClick={() => applySize(size + 1)}
          disabled={size >= MAX_LIST_SIZE}
          aria-label="增加每组单词数"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="segment-group" role="group" aria-label="预设每组单词数">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="segment"
            aria-pressed={size === preset}
            onClick={() => applySize(preset)}
          >
            {preset}
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
