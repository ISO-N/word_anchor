import styles from "./data-placeholder.module.css";

export function DataPlaceholder({
  label = "正在读取本地词库…",
}: {
  label?: string;
}) {
  return (
    <div className="shell page-shell">
      <div className={styles.placeholder} role="status" aria-live="polite">
        <svg
          className={styles.mark}
          viewBox="0 0 24 24"
          fill="none"
          width="28"
          height="28"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 4v16M8 8h8M6 13c0 4.4 2.7 7 6 7s6-2.6 6-7M6 13a2 2 0 1 0 0 .1M18 13a2 2 0 1 0 0 .1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        {/* 读取本地数据期间，这个标题就是该状态的文档大纲顶层级；
            加载完成后会被页面自己的 h1 替换 */}
        <h1 className={styles.text}>{label}</h1>
      </div>
    </div>
  );
}
