import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorageNotice } from "@/components/storage-notice";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/atoms.css";

/**
 * 英文词与数字专用：中文永远走系统黑体，避免 Windows 上落到 SimSun。
 * 只预载 latin 子集的可变正体（48KB），随构建自托管，不请求谷歌。
 */
const crimson = localFont({
  src: "../fonts/crimson-pro-latin-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  variable: "--font-crimson",
  preload: true,
  fallback: ["Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "词锚 Word Anchor · 把单词锚定在记忆里",
  description:
    "一个轻巧的单词记忆工具：管理词库、自动编排清单，用连线练习巩固记忆。",
};

export const viewport: Viewport = {
  themeColor: THEME_COLORS.light,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={crimson.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* 首帧前决定 data-theme，任何主题下刷新都不会闪白 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        <SiteHeader />
        <main className="site-main" id="main-content" tabIndex={-1}>
          <StorageNotice />
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
