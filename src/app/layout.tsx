import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { StorageNotice } from "@/components/storage-notice";
import "./globals.css";

export const metadata: Metadata = {
  title: "词锚 Word Anchor · 把单词锚定在记忆里",
  description:
    "一个轻巧的单词记忆工具：管理词库、自动编排清单，用连线练习巩固记忆。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <SiteHeader />
        <main className="site-main">{children}</main>
        <StorageNotice />
        <footer className="site-footer">
          <div className="shell footer-inner">
            <span className="footer-brand">
              <span className="brand-mark brand-mark-small" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4v16M8 8h8M6 13c0 4.4 2.7 7 6 7s6-2.6 6-7M6 13a2 2 0 1 0 0 .1M18 13a2 2 0 1 0 0 .1"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              词锚 Word Anchor
            </span>
            <span className="footer-note">慢慢积累，牢牢记住。</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
