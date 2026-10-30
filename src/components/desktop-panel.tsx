"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Cable, Loader2, Power } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import {
  checkHealth,
  getApiInfo,
  getAutostart,
  isTauri,
  setAutostart,
} from "@/lib/desktop";
import styles from "./desktop-panel.module.css";

type Health =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; port: number }
  | { state: "error"; message: string };

/** 启动后 Rust 可能还在绑端口，最多重试这么多次 */
const PORT_ATTEMPTS = 20;
const PORT_RETRY_MS = 200;

/** 运行时信息只在客户端存在：首帧（hydration）固定当作浏览器 */
const noopSubscribe = () => () => {};
const serverIsTauri = () => false;

export function DesktopPanel() {
  const desktop = useSyncExternalStore(noopSubscribe, isTauri, serverIsTauri);
  const [port, setPort] = useState<number | null>(null);
  const [health, setHealth] = useState<Health>({ state: "idle" });
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desktop) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function loadPort(attempt: number): Promise<void> {
      try {
        const info = await getApiInfo();
        if (cancelled) return;

        setPort(info.port);
        if (info.port === null && attempt < PORT_ATTEMPTS) {
          timer = setTimeout(() => {
            void loadPort(attempt + 1);
          }, PORT_RETRY_MS);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "读取端口失败");
        }
      }
    }

    void loadPort(0);

    void (async () => {
      try {
        const enabled = await getAutostart();
        if (!cancelled) setAutostartState(enabled);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "读取自启状态失败");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [desktop]);

  async function handleHealth() {
    if (port === null) return;

    setHealth({ state: "checking" });
    const report = await checkHealth(port);
    setHealth(
      report.ok
        ? { state: "ok", port: report.port }
        : { state: "error", message: report.error },
    );
  }

  async function handleAutostart() {
    if (autostart === null || busy) return;

    setBusy(true);
    setError("");

    try {
      const next = !autostart;
      await setAutostart(next);
      setAutostartState(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "切换自启失败");
    } finally {
      setBusy(false);
    }
  }

  const address = port === null ? "启动中…" : `http://127.0.0.1:${port}`;

  return (
    <section className={styles.panel} aria-labelledby="desktop-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="desktop-title">
          桌面端
        </h2>
        <span
          className={
            desktop && port !== null
              ? styles.badge
              : `${styles.badge} ${styles.badgeOff}`
          }
        >
          <Cable size={13} strokeWidth={1.8} aria-hidden="true" />
          {!desktop
            ? "浏览器预览"
            : port === null
              ? "本地接口启动中"
              : "本地接口已就绪"}
        </span>
      </div>

      {desktop ? (
        <>
          <p className={styles.text}>
            Anki 插件按「重来」后直接推到这台电脑上的词锚：关掉窗口也还在收，
            不用打开网页、也不经过剪贴板。
          </p>

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>接口地址</dt>
              <dd>{address}</dd>
            </div>
            <div className={styles.fact}>
              <dt>开机自启</dt>
              <dd>{autostart === null ? "读取中…" : autostart ? "已开启" : "未开启"}</dd>
            </div>
          </dl>

          <div className={styles.actions}>
            <button
              type="button"
              className={buttonClass({ variant: "ghost", size: "sm" })}
              onClick={() => void handleHealth()}
              disabled={port === null || health.state === "checking"}
            >
              {health.state === "checking" ? (
                <Loader2
                  className={styles.spin}
                  size={15}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              ) : (
                <Cable size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
              测试连接
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={autostart === true}
              className={buttonClass({ variant: "ghost", size: "sm" })}
              onClick={() => void handleAutostart()}
              disabled={autostart === null || busy}
            >
              <Power size={15} strokeWidth={1.8} aria-hidden="true" />
              开机自启：{autostart === true ? "开" : "关"}
            </button>
          </div>

          {(health.state === "ok" || health.state === "error" || error) && (
            <p
              className={
                error || health.state === "error"
                  ? `${styles.status} ${styles.statusError}`
                  : styles.status
              }
              role="status"
              aria-live="polite"
            >
              {error ||
                (health.state === "ok"
                  ? `连接正常：词锚在 127.0.0.1:${health.port} 应答。`
                  : health.state === "error"
                    ? `连接失败：${health.message}`
                    : "")}
            </p>
          )}
        </>
      ) : (
        <p className={styles.text}>
          现在是在浏览器里预览：没有本地数据库，也不接收 Anki 推送，刷新即清空。
          日常使用请启动桌面端（<code className={styles.code}>pnpm desktop</code>
          ），词库会落在本机的 SQLite 文件里。
        </p>
      )}
    </section>
  );
}
