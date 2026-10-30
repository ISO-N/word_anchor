import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer} id="site-footer">
      <div className={`shell ${styles.inner}`}>
        <span className={styles.brand} translate="no">
          <svg
            className={styles.mark}
            viewBox="0 0 24 24"
            fill="none"
            width="16"
            height="16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 4v16M8 8h8M6 13c0 4.4 2.7 7 6 7s6-2.6 6-7M6 13a2 2 0 1 0 0 .1M18 13a2 2 0 1 0 0 .1"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          词锚
        </span>
        <span className={styles.note}>
          词库保存在这台电脑上，可随时导出备份。
        </span>
      </div>
    </footer>
  );
}
