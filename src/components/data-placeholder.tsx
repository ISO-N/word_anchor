import { AnchorMark } from "@/components/anchor-mark";
import styles from "./data-placeholder.module.css";

export function DataPlaceholder({
  label = "正在读取本地词库…",
}: {
  label?: string;
}) {
  return (
    <div className="shell page-shell">
      <div className={styles.placeholder} role="status" aria-live="polite">
        <AnchorMark className={styles.mark} size={26} />
        {/* 读取本地数据期间，这个标题就是该状态的文档大纲顶层级；
            加载完成后会被页面自己的 h1 替换 */}
        <h1 className={styles.text}>{label}</h1>
      </div>
    </div>
  );
}
