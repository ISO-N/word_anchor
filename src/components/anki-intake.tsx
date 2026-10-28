"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Inbox, X } from "lucide-react";
import { getListOverview } from "@/lib/data";
import {
  decodeInboxPayload,
  describeIntake,
  extractInboxHash,
} from "@/lib/intake";
import { ensureLoaded, getSnapshot, intakeWords } from "@/lib/store";
import styles from "./anki-intake.module.css";

type Outcome =
  | { kind: "success"; message: string; listIndex: number | null }
  | { kind: "error"; message: string };

/**
 * 同一个 payload 只处理一次：StrictMode 的双挂载、连点同一个深链，
 * 都不会把同一批单词重复走一遍（不过即使走了也无害，词库按单词去重）。
 */
let handledPayload: string | null = null;

function clearInboxHash(): void {
  if (!window.location.hash.startsWith("#inbox=")) return;

  /*
   * 必须把现有的 history.state 原样传回去：Next 16 靠 `__NA` 判断
   * 这个历史条目能不能走客户端路由，传 null 会让后退变成整页刷新。
   */
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
}

/**
 * Anki 深链的接收端：`/#inbox=<payload>`。
 *
 * 挂在 layout 上，所以任意页面都能收；入库后由 store 的 BroadcastChannel
 * 通知其他标签页，收藏夹里一直开着的清单页会当场更新。
 */
export function AnkiIntake() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    function handleHash() {
      const encoded = extractInboxHash(window.location.hash);
      if (!encoded || encoded === handledPayload) return;
      handledPayload = encoded;

      void (async () => {
        await ensureLoaded();
        clearInboxHash();

        try {
          const summary = intakeWords(decodeInboxPayload(encoded));
          const snapshot = getSnapshot();
          const lists = snapshot ? getListOverview(snapshot).lists : [];

          setOutcome({
            kind: "success",
            message: describeIntake(summary),
            listIndex: lists.length > 0 ? lists[lists.length - 1].index : null,
          });
        } catch (caught) {
          setOutcome({
            kind: "error",
            message: caught instanceof Error ? caught.message : "收录失败",
          });
        }
      })();
    }

    handleHash();
    window.addEventListener("hashchange", handleHash);

    return () => window.removeEventListener("hashchange", handleHash);
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
