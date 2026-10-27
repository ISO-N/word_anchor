"use client";

import { useState } from "react";
import { Minus, Plus, Settings2 } from "lucide-react";
import { MAX_LIST_SIZE, MIN_LIST_SIZE } from "@/lib/data";
import { updateListSize } from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";

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
    <div className="list-size-control">
      <span className="size-control-label">
        <Settings2 size={16} />
        每组单词数
      </span>
      <div className="size-stepper">
        <button
          type="button"
          className="stepper-button"
          onClick={() => applySize(size - 1)}
          disabled={size <= MIN_LIST_SIZE}
          aria-label="减少每组单词数"
        >
          <Minus size={14} />
        </button>
        <span className="stepper-value" aria-live="polite">
          {size}
        </span>
        <button
          type="button"
          className="stepper-button"
          onClick={() => applySize(size + 1)}
          disabled={size >= MAX_LIST_SIZE}
          aria-label="增加每组单词数"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="size-presets" aria-label="预设单词数">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`preset-button${size === preset ? " is-active" : ""}`}
            onClick={() => applySize(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      {error && <span className="size-error">{error}</span>}
    </div>
  );
}
