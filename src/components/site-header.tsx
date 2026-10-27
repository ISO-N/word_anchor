"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers3, LibraryBig } from "lucide-react";

const navItems = [
  { href: "/lists", label: "学习清单", icon: Layers3 },
  { href: "/words", label: "单词库", icon: LibraryBig },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="词锚首页">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v16M8 8h8M6 13c0 4.4 2.7 7 6 7s6-2.6 6-7M6 13a2 2 0 1 0 0 .1M18 13a2 2 0 1 0 0 .1"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-copy">
            <strong>词锚</strong>
            <small>WORD ANCHOR</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-note">
          <span className="live-dot" aria-hidden="true" />
          本地词库
        </div>
      </div>
    </header>
  );
}
