"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { curvePath } from "@/lib/geometry";
import { formatClock } from "@/lib/format";
import { markListComplete } from "@/lib/store";
import type { WordRecord } from "@/lib/types";
import styles from "./practice-session.module.css";

type Side = "term" | "meaning";
type NodeRef = { side: Side; id: number };
type Point = { x: number; y: number };
type Pairs = Record<number, number>;
type Feedback = { type: "correct" | "wrong"; message: string; key: number };
type DragStart = {
  source: NodeRef;
  startX: number;
  startY: number;
};

type PracticeSessionProps = {
  listIndex: number;
  words: WordRecord[];
  isPartial: boolean;
  alreadyCompleted: boolean;
  nextIndex: number | null;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function PracticeSession({
  listIndex,
  words,
  isPartial,
  alreadyCompleted,
  nextIndex,
}: PracticeSessionProps) {
  const nodeKey = (side: Side, id: number) => `${side}-${id}`;
  const termLabelId = useId();
  const meaningLabelId = useId();

  const [terms, setTerms] = useState<WordRecord[]>([]);
  const [meanings, setMeanings] = useState<WordRecord[]>([]);
  const [pairs, setPairs] = useState<Pairs>({});
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const [points, setPoints] = useState<Record<string, Point>>({});
  const [elapsed, setElapsed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [completed, setCompleted] = useState(false);
  const [resultElapsed, setResultElapsed] = useState(0);
  const [completionError, setCompletionError] = useState("");
  const [session, setSession] = useState(0);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const suppressClickRef = useRef(false);
  const completionSentRef = useRef(false);
  const preparedRef = useRef(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSession = useCallback(() => {
    setPairs({});
    setSelected(null);
    setDragStart(null);
    setDragPoint(null);
    setAttempts(0);
    setMistakes(0);
    setFeedback(null);
    setCompleted(false);
    setCompletionError("");
    setResultElapsed(0);
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    completionSentRef.current = false;
    setTerms(shuffle(words));
    setMeanings(shuffle(words));
    setSession((current) => current + 1);
  }, [words]);

  useEffect(() => {
    if (preparedRef.current) return;
    preparedRef.current = true;
    resetSession();
  }, [resetSession]);

  useEffect(() => {
    if (!preparedRef.current || completed) return;
    const timer = window.setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [completed, session]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const nextPoints: Record<string, Point> = {};

    nodeRefs.current.forEach((element, key) => {
      const rect = element.getBoundingClientRect();
      const side = key.startsWith("term-") ? "term" : "meaning";
      nextPoints[key] = {
        x: (side === "term" ? rect.right : rect.left) - stageRect.left,
        y: rect.top + rect.height / 2 - stageRect.top,
      };
    });

    setPoints(nextPoints);
  }, []);

  useLayoutEffect(() => {
    if (!terms.length || !meanings.length) return;

    const frame = requestAnimationFrame(measure);
    const stage = stageRef.current;
    const observer = new ResizeObserver(measure);
    if (stage) observer.observe(stage);
    document.fonts?.ready.then(measure).catch(() => undefined);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [terms, meanings, measure]);

  const showFeedback = useCallback((type: Feedback["type"], message: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback({ type, message, key: Date.now() });
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2200);
  }, []);

  const applyConnection = useCallback(
    (source: NodeRef, target: NodeRef) => {
      if (source.side === target.side) return;

      const termId = source.side === "term" ? source.id : target.id;
      const meaningId = source.side === "meaning" ? source.id : target.id;

      setPairs((current) => {
        const next: Pairs = { ...current };
        Object.keys(next).forEach((key) => {
          const id = Number(key);
          if (id === termId || next[id] === meaningId) {
            delete next[id];
          }
        });
        next[termId] = meaningId;
        return next;
      });

      setAttempts((current) => current + 1);
      setSelected(null);

      if (termId === meaningId) {
        showFeedback("correct", "锚住了，这一对匹配正确");
      } else {
        setMistakes((current) => current + 1);
        showFeedback("wrong", "再想想，这两个词还不匹配");
      }
    },
    [showFeedback],
  );

  const handleNodeClick = (side: Side, id: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (!selected) {
      setSelected({ side, id });
      return;
    }

    if (selected.side === side) {
      if (selected.id === id) {
        setSelected(null);
      } else {
        setSelected({ side, id });
      }
      return;
    }

    applyConnection(selected, { side, id });
  };

  useEffect(() => {
    if (!dragStart) return;

    let active = false;

    const handleMove = (event: PointerEvent) => {
      const distance = Math.hypot(
        event.clientX - dragStart.startX,
        event.clientY - dragStart.startY,
      );

      if (!active && distance > 6) {
        active = true;
        setSelected(dragStart.source);
      }

      if (active) {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        setDragPoint({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    };

    const finishDrag = (event: PointerEvent) => {
      if (active) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const node = element?.closest<HTMLElement>("[data-node-side]");
        const side = node?.dataset.nodeSide as Side | undefined;
        const id = Number(node?.dataset.nodeId);

        if (node && side && Number.isFinite(id) && side !== dragStart.source.side) {
          applyConnection(dragStart.source, { side, id });
        }
      }

      setDragStart(null);
      setDragPoint(null);
    };

    const cancelDrag = () => {
      setDragStart(null);
      setDragPoint(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
    };
  }, [dragStart, applyConnection]);

  const pairEntries = useMemo(
    () =>
      Object.entries(pairs).map(([termId, meaningId]) => ({
        termId: Number(termId),
        meaningId,
      })),
    [pairs],
  );

  const meaningPartner = useMemo(() => {
    const partners = new Map<number, number>();
    pairEntries.forEach(({ termId, meaningId }) => {
      partners.set(meaningId, termId);
    });
    return partners;
  }, [pairEntries]);

  const correctCount = pairEntries.filter(
    ({ termId, meaningId }) => termId === meaningId,
  ).length;
  const connectedCount = pairEntries.length;
  const total = words.length;

  useEffect(() => {
    if (completed || total === 0) return;
    /* 一旦完赛过，关闭摘要后不再自动重开 */
    if (completionSentRef.current) return;
    const allCorrect = words.every((word) => pairs[word.id] === word.id);
    if (!allCorrect) return;

    const timer = setTimeout(() => {
      if (completionSentRef.current) return;
      completionSentRef.current = true;
      setResultElapsed(elapsedRef.current);
      setCompleted(true);

      try {
        markListComplete(listIndex, attempts, mistakes);
      } catch (error) {
        setCompletionError(
          error instanceof Error ? error.message : "保存学习记录失败",
        );
      }
    }, 620);

    return () => clearTimeout(timer);
  }, [pairs, words, completed, total, attempts, mistakes, listIndex]);

  const beginDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    side: Side,
    id: number,
  ) => {
    if (completed) return;
    setDragStart({
      source: { side, id },
      startX: event.clientX,
      startY: event.clientY,
    });
  };

  const getStatus = (side: Side, id: number) => {
    if (side === "term") {
      const partner = pairs[id];
      if (partner === undefined) return null;
      return partner === id ? "correct" : "wrong";
    }

    const partner = meaningPartner.get(id);
    if (partner === undefined) return null;
    return partner === id ? "correct" : "wrong";
  };

  const statusText = (side: Side, id: number) => {
    const status = getStatus(side, id);
    if (status === "correct") return "已正确连接";
    if (status === "wrong") return "连接错误";
    return "尚未连接";
  };

  const activeSourcePoint =
    selected && points[nodeKey(selected.side, selected.id)];

  if (total === 0) {
    return (
      <div className="shell page-shell">
        <div className="empty-state">
          <span className="empty-state-icon">
            <Link2 size={20} strokeWidth={1.8} />
          </span>
          <h2>这份清单还没有单词</h2>
          <p>先往词库添加单词，再回来开始练习。</p>
          <div className={styles.emptyActions}>
            <Link href="/words" className={buttonClass()}>
              去添加单词
              <ArrowRight size={16} strokeWidth={1.8} />
            </Link>
            <Link href="/lists" className={buttonClass({ variant: "ghost" })}>
              返回清单
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.topbar}>
        <Link href="/lists" className={styles.back}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          学习清单
        </Link>
        <span className={styles.separator} aria-hidden="true" />
        <span className={styles.listTag} translate="no">
          LIST {String(listIndex).padStart(2, "0")}
        </span>
        {isPartial && <span className={styles.tag}>未满一组</span>}
        {alreadyCompleted && !completed && (
          <span className={`${styles.tag} ${styles.tagDone}`}>
            <Check size={12} strokeWidth={2.4} />
            练过一次
          </span>
        )}
        <div className={styles.topActions}>
          <span className={styles.timer}>
            用时
            <span className={styles.timerValue}>{formatClock(elapsed)}</span>
          </span>
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={resetSession}
          >
            <RotateCcw size={15} strokeWidth={1.8} />
            重新开始
          </button>
        </div>
      </div>

      <div className={styles.heading}>
        <div>
          <h1 className={styles.title}>把单词和释义连起来</h1>
          <p className={styles.subtitle}>
            拖动卡片边缘的圆点拉出连线，或先点单词、再点释义。
          </p>
        </div>
        <p className={styles.score}>
          <span className={styles.scoreValue}>
            {correctCount}
            <span className={styles.scoreTotal}> / {total}</span>
          </span>
          <span className={styles.scoreLabel}>已正确连接</span>
        </p>
      </div>

      <div className={styles.board}>
        <div className={styles.boardHead}>
          <span className={styles.columnLabel} id={termLabelId}>
            <span className={styles.labelIndex} aria-hidden="true">
              A
            </span>
            单词
          </span>
          <span className={styles.centerMark} aria-hidden="true">
            <Link2 size={15} strokeWidth={1.8} />
          </span>
          <span
            className={`${styles.columnLabel} ${styles.columnLabelRight}`}
            id={meaningLabelId}
          >
            释义
            <span className={styles.labelIndex} aria-hidden="true">
              B
            </span>
          </span>
        </div>

        <div className={styles.stage} ref={stageRef}>
          <svg className={styles.lines} aria-hidden="true" focusable="false">
            {pairEntries.map(({ termId, meaningId }) => {
              const start = points[nodeKey("term", termId)];
              const end = points[nodeKey("meaning", meaningId)];
              if (!start || !end) return null;
              const correct = termId === meaningId;
              return (
                <path
                  key={`${termId}-${meaningId}`}
                  d={curvePath(start, end)}
                  className={`${styles.line} ${
                    correct ? styles.lineCorrect : styles.lineWrong
                  }`}
                />
              );
            })}

            {dragStart && dragPoint && activeSourcePoint && (
              <path
                d={curvePath(
                  dragStart.source.side === "term"
                    ? activeSourcePoint
                    : dragPoint,
                  dragStart.source.side === "term"
                    ? dragPoint
                    : activeSourcePoint,
                )}
                className={`${styles.line} ${styles.lineDragging}`}
              />
            )}
          </svg>

          <div
            className={styles.column}
            role="group"
            aria-labelledby={termLabelId}
          >
            {terms.map((word, index) => {
              const status = getStatus("term", word.id);
              const isSelected =
                selected?.side === "term" && selected.id === word.id;
              const isDragging =
                dragStart?.source.side === "term" &&
                dragStart.source.id === word.id;

              return (
                <button
                  key={word.id}
                  type="button"
                  ref={(element) => {
                    if (element) {
                      nodeRefs.current.set(nodeKey("term", word.id), element);
                    } else {
                      nodeRefs.current.delete(nodeKey("term", word.id));
                    }
                  }}
                  data-node-side="term"
                  data-node-id={word.id}
                  className={[
                    styles.card,
                    status === "correct" ? styles.correct : "",
                    status === "wrong" ? styles.wrong : "",
                    isSelected ? styles.selected : "",
                    isDragging ? styles.dragging : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={isSelected}
                  aria-label={`${word.term}，${statusText("term", word.id)}`}
                  onPointerDown={(event) => beginDrag(event, "term", word.id)}
                  onClick={() => handleNodeClick("term", word.id)}
                >
                  <span className={styles.index} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={`${styles.text} ${styles.termText}`} lang="en" translate="no">
                    {word.term}
                  </span>
                  <span
                    className={`${styles.dot} ${styles.dotRight}`}
                    aria-hidden="true"
                  >
                    {status === "correct" && <Check size={9} strokeWidth={3} />}
                    {status === "wrong" && <X size={9} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={styles.column}
            role="group"
            aria-labelledby={meaningLabelId}
          >
            {meanings.map((word) => {
              const status = getStatus("meaning", word.id);
              const isSelected =
                selected?.side === "meaning" && selected.id === word.id;
              const isDragging =
                dragStart?.source.side === "meaning" &&
                dragStart.source.id === word.id;

              return (
                <button
                  key={word.id}
                  type="button"
                  ref={(element) => {
                    if (element) {
                      nodeRefs.current.set(nodeKey("meaning", word.id), element);
                    } else {
                      nodeRefs.current.delete(nodeKey("meaning", word.id));
                    }
                  }}
                  data-node-side="meaning"
                  data-node-id={word.id}
                  className={[
                    styles.card,
                    status === "correct" ? styles.correct : "",
                    status === "wrong" ? styles.wrong : "",
                    isSelected ? styles.selected : "",
                    isDragging ? styles.dragging : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={isSelected}
                  aria-label={`${word.meaning}，${statusText("meaning", word.id)}`}
                  onPointerDown={(event) => beginDrag(event, "meaning", word.id)}
                  onClick={() => handleNodeClick("meaning", word.id)}
                >
                  <span
                    className={`${styles.dot} ${styles.dotLeft}`}
                    aria-hidden="true"
                  >
                    {status === "correct" && <Check size={9} strokeWidth={3} />}
                    {status === "wrong" && <X size={9} strokeWidth={3} />}
                  </span>
                  <span className={`${styles.text} ${styles.meaningText}`}>
                    {word.meaning}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.foot}>
          <div className={styles.progress}>
            <span>
              已连接 {connectedCount} / {total}
            </span>
            <span className={`progress-rule ${styles.track}`}>
              <span
                style={{
                  width: `${total ? (connectedCount / total) * 100 : 0}%`,
                }}
              />
            </span>
          </div>

          <div
            className={[
              styles.feedback,
              feedback?.type === "correct" ? styles.feedbackCorrect : "",
              feedback?.type === "wrong" ? styles.feedbackWrong : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={feedback?.key ?? "idle"}
            role="status"
            aria-live="polite"
          >
            {feedback ? (
              <>
                {feedback.type === "correct" ? (
                  <Check size={14} strokeWidth={2.4} />
                ) : (
                  <X size={14} strokeWidth={2.4} />
                )}
                {feedback.message}
              </>
            ) : (
              <>
                <Sparkles size={14} strokeWidth={1.8} />
                连接正确的词义，完成后会自动收束
              </>
            )}
          </div>

          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setPairs({});
              setSelected(null);
              showFeedback("correct", "已清空连线，再试一次");
            }}
            disabled={connectedCount === 0}
          >
            清空连线
          </button>
        </div>
      </div>

      <Dialog
        open={completed}
        onClose={() => setCompleted(false)}
        title={`LIST ${String(listIndex).padStart(2, "0")} 全部连对`}
        description={
          completionError
            ? `记录保存失败：${completionError}`
            : `${total} 个单词与释义已经重新系在一起。`
        }
        footer={
          <>
            <button
              type="button"
              className={buttonClass()}
              onClick={resetSession}
            >
              <RotateCcw size={16} strokeWidth={1.8} />
              再练一次
            </button>
            {nextIndex ? (
              <Link
                href={`/practice/?list=${nextIndex}`}
                className={buttonClass({ variant: "ghost" })}
              >
                下一份清单
                <ArrowRight size={16} strokeWidth={1.8} />
              </Link>
            ) : (
              <Link href="/lists" className={buttonClass({ variant: "ghost" })}>
                返回清单
                <ArrowRight size={16} strokeWidth={1.8} />
              </Link>
            )}
          </>
        }
      >
        <div className={styles.stats}>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{formatClock(resultElapsed)}</span>
            <span className={styles.statLabel}>本轮用时</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{attempts}</span>
            <span className={styles.statLabel}>连接次数</span>
          </span>
          <span className={styles.statItem}>
            <span
              className={`${styles.statValue}${mistakes > 0 ? ` ${styles.statWarm}` : ""}`}
            >
              {mistakes}
            </span>
            <span className={styles.statLabel}>失误次数</span>
          </span>
        </div>
      </Dialog>
    </div>
  );
}
