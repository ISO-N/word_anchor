"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnchorMark } from "@/components/anchor-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./site-header.module.css";

const NAV_ITEMS = [
  { href: "/lists", label: "学习清单" },
  { href: "/review", label: "趣味复习" },
  { href: "/words", label: "单词库" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header} id="site-header">
      {/* 胶囊浮在同色的遮罩带里：带子静止时看不见，滚动时把内容整齐裁在它下面 */}
      <div className={styles.capsule}>
        <Link className={styles.brand} href="/" aria-label="词锚首页" translate="no">
          <AnchorMark className={styles.mark} size={18} />
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
