import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="shell not-found-page">
      <span className="not-found-icon">
        <Compass size={34} />
      </span>
      <p className="eyebrow">OFF THE MAP</p>
      <h1>这里没有你要找的清单</h1>
      <p>它可能因为单词数量变化而被重新编排了。</p>
      <Link href="/lists" className="button button-primary">
        <ArrowLeft size={17} />
        返回学习清单
      </Link>
    </div>
  );
}
