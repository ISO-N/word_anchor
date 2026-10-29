"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./site-header.module.css";

const NAV_ITEMS = [
  { href: "/lists", label: "学习清单" },
  { href: "/review", label: "趣味复习" },
  { href: "/words", label: "单词库" },
];

function AnchorMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 24 24"
      fill="none"
      width="22"
      height="22"
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
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header} id="site-header">
      <div className={`shell ${styles.inner}`}>
        <Link className={styles.brand} href="/" aria-label="词锚首页" translate="no">
          <AnchorMark />
          <span className={styles.brandText}>词锚</span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.link}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
