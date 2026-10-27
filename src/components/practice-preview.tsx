import { curvePath } from "@/lib/geometry";
import type { WordRecord } from "@/lib/types";
import styles from "./practice-preview.module.css";

/**
 * 首页的板面预览：与练习页同一套墨线（curvePath），
 * 只是按行对齐，让「词 ⟷ 义」这件事在第一屏就可读。
 */
export function PracticePreview({ words }: { words: WordRecord[] }) {
  return (
    <ol className={styles.list}>
      {words.map((word, index) => {
        const startY = index % 2 === 0 ? 15 : 5;
        const endY = index % 2 === 0 ? 5 : 15;

        return (
          <li className={styles.row} key={word.id}>
            <span className={styles.term} lang="en" translate="no">
              {word.term}
            </span>
            <svg
              className={styles.link}
              viewBox="0 0 48 20"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d={curvePath(
                  { x: 0, y: startY },
                  { x: 48, y: endY },
                  0.38,
                  6,
                )}
              />
            </svg>
            <span className={styles.meaning}>{word.meaning}</span>
          </li>
        );
      })}
    </ol>
  );
}
