"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flame,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatClock } from "@/lib/format";
import {
  buildReviewRound,
  type ReviewOption,
  type ReviewQuestion,
} from "@/lib/review";
import { recordReviewResult } from "@/lib/store";
import type { WordRecord } from "@/lib/types";
import styles from "./review-session.module.css";

type Answer = {
  wordId: number;
  term: string;
  /** 正确释义：结算里给答错的词配答案 */
  meaning: string;
  correct: boolean;
};

type Phase = "answering" | "revealed";

/** 判定后停留多久自动进入下一题；答错留更久，方便看清正确答案 */
const REVEAL_DELAY_MS = { correct: 900, wrong: 1600 } as const;

/** 入场延迟：顶栏 0，题面 1 */
const rise = (step: number): CSSProperties =>
  ({ "--i": step }) as CSSProperties;

function wrongEntriesOf(answers: Answer[]) {
  const byWord = new Map<
    number,
    { term: string; meaning: string; count: number }
  >();

  answers.forEach((entry) => {
    if (entry.correct) return;

    const existing = byWord.get(entry.wordId);
    if (existing) {
      existing.count += 1;
      return;
    }

    byWord.set(entry.wordId, {
      term: entry.term,
      meaning: entry.meaning,
      count: 1,
    });
  });

  return [...byWord.values()];
}

export function ReviewSession({ words }: { words: WordRecord[] }) {
  const [round, setRound] = useState<ReviewQuestion[]>(() =>
    buildReviewRound(words),
  );
  const [index, setIndex] = useState(0);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultElapsed, setResultElapsed] = useState(0);
  /** 每次「重新开始 / 再来一局」+1，让计时器重新起跑 */
  const [session, setSession] = useState(0);

  const indexRef = useRef(0);
  const phaseRef = useRef<Phase>("answering");
  const finishedRef = useRef(false);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptRef = useRef<HTMLHeadingElement | null>(null);
  const previousIndexRef = useRef(0);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (finished) return;

    const timer = window.setInterval(() => {
      const next = Math.floor((Date.now() - startedAtRef.current) / 1000);
      elapsedRef.current = next;
      setElapsed(next);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [finished, session]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const question = round[index];
  const total = round.length;

  const advance = useCallback(() => {
    if (phaseRef.current !== "revealed" || finishedRef.current) return;

    clearAdvanceTimer();
    phaseRef.current = "answering";

    if (indexRef.current + 1 >= round.length) {
      const finalElapsed = Math.floor(
        (Date.now() - startedAtRef.current) / 1000,
      );
      finishedRef.current = true;
      elapsedRef.current = finalElapsed;
      setElapsed(finalElapsed);
      setResultElapsed(finalElapsed);
      setFinished(true);
      setDialogOpen(true);
      return;
    }

    indexRef.current += 1;
    setIndex(indexRef.current);
    setChosenId(null);
    setRevealed(false);
  }, [clearAdvanceTimer, round.length]);

  const answer = useCallback(
    (questionIndex: number, optionId: number) => {
      /* 自动前进与点击可能同时发生：题号对不上就是上一题的回声，直接忽略 */
      if (questionIndex !== indexRef.current) return;
      if (phaseRef.current !== "answering" || finishedRef.current) return;

      const current = round[questionIndex];
      if (!current) return;
      if (!current.options.some((option) => option.wordId === optionId)) return;

      const correct = optionId === current.correctId;
      const correctMeaning =
        current.options.find((option) => option.wordId === current.correctId)
          ?.meaning ?? "";

      phaseRef.current = "revealed";
      setChosenId(optionId);
      setRevealed(true);
      setAnswers((entries) => [
        ...entries,
        {
          wordId: current.wordId,
          term: current.term,
          meaning: correctMeaning,
          correct,
        },
      ]);

      const nextStreak = correct ? streakRef.current + 1 : 0;
      streakRef.current = nextStreak;
      setStreak(nextStreak);
      if (nextStreak > bestStreakRef.current) {
        bestStreakRef.current = nextStreak;
        setBestStreak(nextStreak);
      }

      recordReviewResult(current.wordId, correct);

      advanceTimerRef.current = setTimeout(
        advance,
        correct ? REVEAL_DELAY_MS.correct : REVEAL_DELAY_MS.wrong,
      );
    },
    [advance, round],
  );

  const restart = useCallback(() => {
    clearAdvanceTimer();

    indexRef.current = 0;
    phaseRef.current = "answering";
    finishedRef.current = false;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;

    setRound(buildReviewRound(words));
    setIndex(0);
    setChosenId(null);
    setRevealed(false);
    setAnswers([]);
    setStreak(0);
    setBestStreak(0);
    setElapsed(0);
    setFinished(false);
    setDialogOpen(false);
    setResultElapsed(0);
    setSession((current) => current + 1);
  }, [clearAdvanceTimer, words]);

  /* 换题时把焦点交给题面：读屏会念出新单词，也避免 Enter 误触上一个选项 */
  useEffect(() => {
    if (previousIndexRef.current === index) return;
    previousIndexRef.current = index;
    promptRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (finishedRef.current) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (phaseRef.current === "answering") {
        const current = round[indexRef.current];
        const digit = Number(event.key);

        if (
          current &&
          Number.isInteger(digit) &&
          digit >= 1 &&
          digit <= current.options.length
        ) {
          event.preventDefault();
          answer(indexRef.current, current.options[digit - 1].wordId);
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        advance();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, answer, round]);

  const correctCount = answers.filter((entry) => entry.correct).length;
  const answeredCount = answers.length;
  const accuracy = answeredCount
    ? Math.round((correctCount / answeredCount) * 100)
    : 0;
  const wrongEntries = useMemo(() => wrongEntriesOf(answers), [answers]);
  const correctMeaning =
    question?.options.find((option) => option.wordId === question.correctId)
      ?.meaning ?? "";
  const chosenWrong = revealed && chosenId !== question?.correctId;

  if (!question) {
    return null;
  }

  const optionClassName = (option: ReviewOption) => {
    if (!revealed) return styles.option;

    if (option.wordId === question.correctId) {
      return `${styles.option} ${styles.correct}`;
    }

    if (option.wordId === chosenId) {
      return `${styles.option} ${styles.wrong}`;
    }

    return styles.option;
  };

  const optionLabel = (option: ReviewOption) => {
    if (!revealed) return option.meaning;

    if (option.wordId === chosenId) {
      return option.wordId === question.correctId
        ? `${option.meaning}，答对`
        : `${option.meaning}，已选，答错`;
    }

    return option.wordId === question.correctId
      ? `${option.meaning}，正确答案`
      : option.meaning;
  };

  const resultSummary = (
    <>
      <div className="data-strip">
        <span className="data-cell">
          <span className="data-value">
            {correctCount}
            <span className={styles.statTotal}> / {answeredCount}</span>
          </span>
          <span className="data-label">答对</span>
        </span>
        <span className="data-cell">
          <span className="data-value">{accuracy}%</span>
          <span className="data-label">正确率</span>
        </span>
        <span className="data-cell">
          <span className="data-value">{formatClock(resultElapsed)}</span>
          <span className="data-label">用时</span>
        </span>
        <span className="data-cell">
          <span className="data-value">{bestStreak}</span>
          <span className="data-label">最高连击</span>
        </span>
      </div>

      {wrongEntries.length === 0 ? (
        <p className={styles.allCorrect}>
          <Sparkles size={15} strokeWidth={1.8} />
          全部答对，这一轮没有任何一个词漏掉。
        </p>
      ) : (
        <div className={styles.wrongBlock}>
          <p className={styles.wrongTitle}>需要再看一眼的词</p>
          <ul className={styles.wrongList}>
            {wrongEntries.map((entry) => (
              <li className={styles.wrongItem} key={entry.term}>
                <span className={styles.wrongTerm} lang="en" translate="no">
                  {entry.term}
                </span>
                <span className={styles.wrongMeaning}>{entry.meaning}</span>
                {entry.count > 1 && (
                  <span className={styles.wrongCount}>×{entry.count}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <div className={styles.page}>
      <div className={`rise ${styles.topbar}`} style={rise(0)}>
        <Link href="/words" className={styles.back}>
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          单词库
        </Link>
        <span className={styles.separator} aria-hidden="true" />
        <span className={styles.tag}>趣味复习</span>
        <span className={styles.counter}>
          {finished
            ? `共 ${total} 题`
            : `第 ${index + 1} / ${total} 题`}
        </span>
        <div className={styles.topActions}>
          <span className={styles.timer}>
            连击
            <span className={styles.timerValue}>{streak}</span>
            <Flame size={13} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className={styles.timer}>
            用时
            <span className={styles.timerValue}>{formatClock(elapsed)}</span>
          </span>
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={restart}
          >
            <RotateCcw size={14} strokeWidth={1.9} aria-hidden="true" />
            重新开始
          </button>
        </div>
      </div>

      {finished ? (
        <section
          className={`rise ${styles.board}`}
          style={rise(1)}
          aria-labelledby="review-result-title"
        >
          <div className={styles.resultHead}>
            <h1 className={styles.title} id="review-result-title">
              本局结束
            </h1>
            <p className={styles.subtitle}>
              {total} 题里答对 {correctCount} 题，最高连击 {bestStreak}。
            </p>
          </div>
          {resultSummary}
          <div className={styles.resultActions}>
            <button type="button" className={buttonClass()} onClick={restart}>
              <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
              再来一局
            </button>
            <Link href="/words" className={buttonClass({ variant: "ghost" })}>
              返回单词库
              <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section
            className={`rise ${styles.board}`}
            style={rise(1)}
            aria-labelledby="review-title"
          >
            {/* 这屏的问题就是「这个词是什么意思」，所以词本身就是 h1 */}
            <h1
              className={styles.prompt}
              id="review-title"
              lang="en"
              translate="no"
              ref={promptRef}
              tabIndex={-1}
            >
              {question.term}
            </h1>

            <div
              className={styles.options}
              role="group"
              aria-label={`${question.term} 的释义选项`}
            >
              {question.options.map((option, optionIndex) => (
                <button
                  key={`${question.wordId}-${option.wordId}`}
                  type="button"
                  className={optionClassName(option)}
                  aria-disabled={revealed || undefined}
                  aria-keyshortcuts={String(optionIndex + 1)}
                  aria-label={optionLabel(option)}
                  onClick={() => answer(index, option.wordId)}
                >
                  <span className={styles.optionKey} aria-hidden="true">
                    {optionIndex + 1}
                  </span>
                  <span className={styles.optionText}>{option.meaning}</span>
                  {revealed && option.wordId === question.correctId && (
                    <Check
                      className={styles.optionMark}
                      size={16}
                      strokeWidth={2.4}
                      aria-hidden="true"
                    />
                  )}
                  {revealed &&
                    option.wordId === chosenId &&
                    option.wordId !== question.correctId && (
                      <X
                        className={styles.optionMark}
                        size={16}
                        strokeWidth={2.4}
                        aria-hidden="true"
                      />
                    )}
                </button>
              ))}
            </div>

            <div className={styles.foot}>
              <div className={styles.progress}>
                <span>
                  已答 {answeredCount} / {total}
                </span>
                <span className={`progress-rule ${styles.track}`}>
                  <span
                    style={{
                      width: `${total ? (answeredCount / total) * 100 : 0}%`,
                    }}
                  />
                </span>
              </div>

              <div
                className={[
                  styles.feedback,
                  revealed
                    ? chosenWrong
                      ? styles.feedbackWrong
                      : styles.feedbackCorrect
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="status"
                aria-live="polite"
              >
                {revealed ? (
                  chosenWrong ? (
                    <>
                      <X size={14} strokeWidth={2.4} />
                      正确答案：{correctMeaning}
                    </>
                  ) : (
                    <>
                      <Check size={14} strokeWidth={2.4} />
                      答对了，继续保持
                    </>
                  )
                ) : (
                  <>
                    <Sparkles size={14} strokeWidth={1.8} />
                    按数字键 1–{question.options.length} 也能作答
                  </>
                )}
              </div>

              {revealed && (
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  onClick={advance}
                >
                  下一题
                  <ArrowRight size={15} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </section>
        </>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="本局结束"
        description={`${total} 题里答对 ${correctCount} 题，正确率 ${accuracy}%。`}
        footer={
          <>
            <button type="button" className={buttonClass()} onClick={restart}>
              <RotateCcw size={16} strokeWidth={1.8} />
              再来一局
            </button>
            <Link href="/words" className={buttonClass({ variant: "ghost" })}>
              返回单词库
              <ArrowRight size={16} strokeWidth={1.8} />
            </Link>
          </>
        }
      >
        {resultSummary}
      </Dialog>
    </div>
  );
}
