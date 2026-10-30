import Link from "next/link";
import { AnchorMark } from "@/components/anchor-mark";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer} id="site-footer">
      <div className={`shell ${styles.inner}`}>
        <p className={styles.note}>
          <span className={styles.brand} translate="no">
            <AnchorMark size={14} />
            词锚
          </span>
          <span className={styles.separator} aria-hidden="true" />
          词库保存在这台电脑上，可随时导出备份。
        </p>
        <Link href="/words" className={styles.link}>
          备份与桌面端
        </Link>
      </div>
    </footer>
  );
}
