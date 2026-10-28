import { curvePath } from "@/lib/geometry";
import type { WordRecord } from "@/lib/types";
import styles from "./practice-preview.module.css";

/**
 * 首页的板面骨架：只摆出「左词 ⟶ 右义」的形状与墨线，右列留白。
 *
 * 这里**不能**渲染真实的释义：这块预览对应的正是「下一次要练习的清单」，
 * 把词与义按行摆出来等于开练前交出答案。
 */
export function PracticePreview({ words }: { words: WordRecord[] }) {
  return (
    <>
      <ol className={styles.list}>
        {words.map((word, index) => {
          const startY = index % 2 === 0 ? 15 : 5;
          const endY = index % 2 === 0 ? 5 : 15;
          /* 宽度只由 id 决定：不会随渲染抖动，也不泄漏释义的长短 */
          const blankWidth = 46 + ((word.id * 37) % 42);

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
              <span
                className={styles.blank}
                aria-hidden="true"
                style={{ width: `${blankWidth}%` }}
              />
            </li>
          );
        })}
      </ol>
      <p className={styles.hint}>释义会在开始练习后出现</p>
    </>
  );
}
