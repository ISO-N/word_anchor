"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Inbox, X } from "lucide-react";
import { getListOverview } from "@/lib/data";
import {
  isTauri,
  listInbox,
  onIntake,
  removeInboxFile,
} from "@/lib/desktop";
import { describeIntake, parseIntakeBody } from "@/lib/intake";
import { ensureLoaded, getSnapshot, intakeWords } from "@/lib/store";
import type { IntakeSummary } from "@/lib/types";
import styles from "./anki-intake.module.css";

type Outcome =
  | { kind: "success"; message: string; listIndex: number | null }
  | { kind: "error"; message: string };

/**
 * 收件箱的唯一消费者。
 *
 * 两条入口共用同一个扫描动作：
 *   - 启动时扫一遍（Anki 在词锚没开的时候推过词）；
 *   - 收到 Rust 的 `anki:intake` 事件时立刻再扫一遍。
 * 每条文件处理完就删掉；同一个 payload 重复投递只会被 `applyIntake` 去重。
 *
 * 扫描动作串行化在模块级：事件连发时不会有两个扫描同时读同一批文件。
 */
let drainGate: Promise<void> = Promise.resolve();

/** 结果发布给「当前挂载的」组件：StrictMode 双挂载时只会有一个赢家 */
let publish: ((outcome: Outcome) => void) | null = null;

function scheduleDrain(task: () => Promise<void>): void {
  drainGate = drainGate.then(task, task).catch(() => {
    /* 单次扫描失败不应该让后续扫描也停摆 */
  });
}

function emptySummary(): IntakeSummary {
  return { added: [], duplicates: [], requeued: [], rejected: [] };
}

function mergeSummary(target: IntakeSummary, source: IntakeSummary): void {
  target.added.push(...source.added);
  target.duplicates.push(...source.duplicates);
  target.requeued.push(...source.requeued);
  target.rejected.push(...source.rejected);
}

function lastListIndex(): number | null {
  const snapshot = getSnapshot();
  const lists = snapshot ? getListOverview(snapshot).lists : [];
  return lists.length > 0 ? lists[lists.length - 1].index : null;
}

async function drainInbox(): Promise<void> {
  await ensureLoaded();

  let items;
  try {
    items = await listInbox();
  } catch (error) {
    console.error("[word-anchor] 读取收件箱失败", error);
    return;
  }
  if (items.length === 0) return;

  const summary = emptySummary();
  const errors: string[] = [];

  for (const item of items) {
    try {
      mergeSummary(summary, intakeWords(parseIntakeBody(item.payload)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "收录失败");
      console.error("[word-anchor] 收件箱里的内容无法收录", item.path, error);
    }

    /* 坏 payload 也要移走：留着只会每次启动都报同一个错 */
    await removeInboxFile(item.path).catch((error: unknown) => {
      console.error("[word-anchor] 删除收件箱文件失败", item.path, error);
    });
  }

  const received =
    summary.added.length +
    summary.duplicates.length +
    summary.requeued.length +
    summary.rejected.length;

  if (received > 0) {
    publish?.({
      kind: "success",
      message: describeIntake(summary),
      listIndex: lastListIndex(),
    });
  } else if (errors.length > 0) {
    publish?.({ kind: "error", message: errors[0] });
  }
}

export function AnkiIntake() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    publish = setOutcome;
    scheduleDrain(drainInbox);

    let stop: (() => void) | null = null;
    let active = true;

    void onIntake(() => {
      scheduleDrain(drainInbox);
    })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      })
      .catch((error: unknown) => {
        console.error("[word-anchor] 订阅 anki:intake 失败", error);
      });

    return () => {
      active = false;
      stop?.();
      if (publish === setOutcome) publish = null;
    };
  }, []);

  if (!outcome) return null;

  const isError = outcome.kind === "error";

  return (
    <div className="shell">
      <div
        className={
          isError ? `${styles.banner} ${styles.bannerError}` : styles.banner
        }
        role={isError ? "alert" : "status"}
      >
        <Inbox
          className={styles.icon}
          size={18}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p className={styles.text}>
          {isError ? (
            <>
              <strong>收录失败</strong>：{outcome.message}
            </>
          ) : (
            <strong>{outcome.message}</strong>
          )}
        </p>

        {outcome.kind === "success" && outcome.listIndex !== null && (
          <Link
            className={styles.action}
            href={`/practice/?list=${outcome.listIndex}`}
          >
            去练习最后一组
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        )}

        <button
          type="button"
          className={styles.close}
          onClick={() => setOutcome(null)}
          aria-label="关闭收录提示"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
