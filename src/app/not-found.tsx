import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "页面不在了 · 词锚 Word Anchor",
  description: "这个地址没有对应的清单页面，它可能因为单词数量变化被重新编排了。",
};

export default function NotFound() {
  return (
    <div className={`shell ${styles.page}`}>
      <Compass size={32} strokeWidth={1.5} className={styles.icon} />
      <h1 className={styles.title}>这里没有你要找的清单</h1>
      <p className={styles.text}>
        它可能因为单词数量变化而被重新编排了。
      </p>
      <Link href="/lists" className={buttonClass()}>
        <ArrowLeft size={16} strokeWidth={1.8} />
        返回学习清单
      </Link>
    </div>
  );
}
