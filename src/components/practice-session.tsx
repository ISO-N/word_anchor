"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WordRecord } from "@/lib/types";
import { formatClock } from "@/lib/format";
import { markListComplete } from "@/lib/store";

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

function curvePath(start: Point, end: Point): string {
  const bend = Math.max(36, Math.abs(end.x - start.x) * 0.38);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${
    end.x - bend
  } ${end.y}, ${end.x} ${end.y}`;
}

export function PracticeSession({
  listIndex,
  words,
  isPartial,
  alreadyCompleted,
  nextIndex,
}: PracticeSessionProps) {
  const nodeKey = (side: Side, id: number) => `${side}-${id}`;
  const wordKey = words.map((word) => word.id).join("-");

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
  const startedAtRef = useRef(Date.now());
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
      const nextElapsed = Math.floor(
        (Date.now() - startedAtRef.current) / 1000,
      );
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
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => undefined);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
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
        const element = document.elementFromPoint(
          event.clientX,
          event.clientY,
        );
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
    const allCorrect = words.every((word) => pairs[word.id] === word.id);
    if (!allCorrect) return;

    const timer = setTimeout(() => {
      setResultElapsed(elapsedRef.current);
      setCompleted(true);
      if (completionSentRef.current) return;
      completionSentRef.current = true;

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

  const activeSourcePoint =
    selected && points[nodeKey(selected.side, selected.id)];

  const progressPercent = total ? Math.round((correctCount / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="shell practice-empty">
        <span className="empty-illustration">
          <Link2 size={32} />
        </span>
        <p className="eyebrow">NOT ENOUGH WORDS</p>
        <h1>这份清单还没有单词</h1>
        <p>先往词库添加单词，再回来开始练习。</p>
        <div className="practice-empty-actions">
          <Link href="/words" className="button button-primary">
            去添加单词
            <ArrowRight size={17} />
          </Link>
          <Link href="/lists" className="button button-ghost">
            返回清单
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell practice-shell">
      <div className="practice-topbar">
        <Link href="/lists" className="back-link">
          <ArrowLeft size={17} />
          学习清单
        </Link>
        <span className="topbar-separator" />
        <span className="list-tag">
          LIST {String(listIndex).padStart(2, "0")}
        </span>
        {isPartial && <span className="soft-tag">未满一组</span>}
        {alreadyCompleted && !completed && (
          <span className="soft-tag soft-tag-done">
            <Check size={12} />
            练过一次
          </span>
        )}
        <div className="practice-topbar-actions">
          <div className="timer-chip">
            <span className="timer-dot" />
            <span className="timer-label">用时</span>
            <strong>{formatClock(elapsed)}</strong>
          </div>
          <button className="button button-ghost button-small" onClick={resetSession}>
            <RotateCcw size={15} />
            重新开始
          </button>
        </div>
      </div>

      <div className="practice-heading">
        <div>
          <p className="eyebrow">MATCH THE MEANINGS</p>
          <h1>把单词和释义连起来</h1>
          <p className="practice-subtitle">
            拖动卡片边缘的圆点拉出连线，或先点单词、再点释义。
          </p>
        </div>
        <div className="practice-score">
          <div className="score-copy">
            <strong>
              {correctCount}
              <span> / {total}</span>
            </strong>
            <span>已正确连接</span>
          </div>
          <div className="score-ring" style={{ "--score": `${progressPercent * 3.6}deg` } as React.CSSProperties}>
            <span>{progressPercent}%</span>
          </div>
        </div>
      </div>

      <div className="practice-board">
        <div className="board-head">
          <span className="board-column-label">
            <span className="label-index">A</span> WORDS
          </span>
          <span className="board-center-mark" aria-hidden="true">
            <Link2 size={16} />
          </span>
          <span className="board-column-label board-column-label-right">
            MEANINGS <span className="label-index">B</span>
          </span>
        </div>

        <div className="stage" ref={stageRef}>
          <svg className="connection-layer" aria-hidden="true">
            {pairEntries.map(({ termId, meaningId }) => {
              const start = points[nodeKey("term", termId)];
              const end = points[nodeKey("meaning", meaningId)];
              if (!start || !end) return null;
              const correct = termId === meaningId;
              return (
                <path
                  key={`${termId}-${meaningId}`}
                  d={curvePath(start, end)}
                  className={`connection-line ${correct ? "is-correct" : "is-wrong"}`}
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
                className="connection-line is-dragging"
              />
            )}
          </svg>

          <div className="board-column terms-column">
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
                    if (element) nodeRefs.current.set(nodeKey("term", word.id), element);
                    else nodeRefs.current.delete(nodeKey("term", word.id));
                  }}
                  data-node-side="term"
                  data-node-id={word.id}
                  className={`node-card term-node${status ? ` is-${status}` : ""}${isSelected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
                  onPointerDown={(event) => beginDrag(event, "term", word.id)}
                  onClick={() => handleNodeClick("term", word.id)}
                >
                  <span className="node-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="node-text">{word.term}</span>
                  <span className="node-dot">
                    {status === "correct" && <Check size={10} strokeWidth={3} />}
                    {status === "wrong" && <X size={10} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="board-column meanings-column">
            {meanings.map((word, index) => {
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
                    if (element) nodeRefs.current.set(nodeKey("meaning", word.id), element);
                    else nodeRefs.current.delete(nodeKey("meaning", word.id));
                  }}
                  data-node-side="meaning"
                  data-node-id={word.id}
                  className={`node-card meaning-node${status ? ` is-${status}` : ""}${isSelected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
                  onPointerDown={(event) => beginDrag(event, "meaning", word.id)}
                  onClick={() => handleNodeClick("meaning", word.id)}
                >
                  <span className="node-dot">
                    {status === "correct" && <Check size={10} strokeWidth={3} />}
                    {status === "wrong" && <X size={10} strokeWidth={3} />}
                  </span>
                  <span className="node-text">{word.meaning}</span>
                  <span className="node-letter">
                    {String.fromCharCode(65 + index)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="board-foot">
          <div className="board-progress">
            <span className="board-progress-label">
              已连接 <strong>{connectedCount}</strong> / {total}
            </span>
            <span className="board-progress-track">
              <span style={{ width: `${(connectedCount / total) * 100}%` }} />
            </span>
          </div>
          <div
            className={`board-feedback${feedback ? ` is-${feedback.type}` : ""}`}
            key={feedback?.key ?? "idle"}
            aria-live="polite"
          >
            {feedback ? (
              <>
                {feedback.type === "correct" ? (
                  <Check size={15} />
                ) : (
                  <X size={15} />
                )}
                {feedback.message}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                连接正确的词义，完成后会自动收束
              </>
            )}
          </div>
          <button
            className="clear-link"
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

      {completed && (
        <div className="completion-overlay">
          <div className="completion-card">
            <div className="completion-ring" aria-hidden="true">
              <span className="completion-anchor">
                <Trophy size={28} strokeWidth={1.5} />
              </span>
            </div>
            <p className="eyebrow">ANCHORED · LIST {String(listIndex).padStart(2, "0")}</p>
            <h2>全部连对，记忆又深了一点。</h2>
            <p className="completion-subtitle">
              {total} 个单词与释义已经重新系在一起。
              {completionError ? `（记录保存失败：${completionError}）` : ""}
            </p>
            <div className="completion-stats">
              <div>
                <strong>{formatClock(resultElapsed)}</strong>
                <span>本轮用时</span>
              </div>
              <div>
                <strong>{attempts}</strong>
                <span>连接次数</span>
              </div>
              <div>
                <strong className={mistakes > 0 ? "stat-warm" : ""}>
                  {mistakes}
                </strong>
                <span>失误次数</span>
              </div>
            </div>
            <div className="completion-actions">
              <button className="button button-primary" onClick={resetSession}>
                <RotateCcw size={16} />
                再练一次
              </button>
              {nextIndex ? (
                <Link
                  href={`/practice/?list=${nextIndex}`}
                  className="button button-ghost"
                >
                  下一份清单
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Link href="/lists" className="button button-ghost">
                  返回清单
                  <ArrowRight size={16} />
                </Link>
              )}
            </div>
            <Link href="/lists" className="completion-back">
              回到学习清单
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
