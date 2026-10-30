import {
  applyIntake,
  completeStudyList,
  createEmptyDatabase,
  createWord,
  deleteWord,
  deleteWords,
  recordReviewAnswer,
  setFeedbackMode,
  setListSize,
  updateWord,
} from "@/lib/data";
import { normalizeDatabase } from "@/lib/backup";
import { isTauri } from "@/lib/platform";
import {
  loadSnapshotFrom,
  openDatabase,
  saveSnapshotTo,
  type DatabaseLike,
} from "@/lib/sqlite";
import type {
  AppDatabase,
  FeedbackMode,
  IntakeSummary,
  ParsedIntake,
} from "@/lib/types";

/**
 * 词锚的「数据库」。
 *
 * 内存里只有一份不可变快照，所有读取都走 `getSnapshot()`，
 * 所有写入都是「算出新快照 → 立刻通知 React → 排队落盘到 SQLite」。
 * 界面永远是同步响应的，持久化失败也不会阻塞交互。
 *
 * 落盘策略见 `@/lib/sqlite`：整份快照 upsert 进 `words`，再删掉快照之外的行。
 * 没有 BroadcastChannel 了——桌面端只有这一个窗口在写库。
 */

let snapshot: AppDatabase | null = null;
let persistError: string | null = null;
let loadPromise: Promise<void> | null = null;
let databasePromise: Promise<DatabaseLike> | null = null;
let writeChain: Promise<void> = Promise.resolve();
/** 没有 Tauri 运行时（浏览器预览、jsdom 单测）时只跑内存，不尝试落盘 */
let desktop = false;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): AppDatabase | null {
  return snapshot;
}

export function getPersistError(): string | null {
  return persistError;
}

export function clearPersistError(): void {
  if (persistError === null) return;
  persistError = null;
  emit();
}

function reportPersistError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : "本地数据保存失败";
  console.error("[word-anchor] 本地数据保存失败", error);
  persistError = message;
  emit();
}

function database(): Promise<DatabaseLike> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function readState(): Promise<AppDatabase | null> {
  return loadSnapshotFrom(await database());
}

async function writeState(state: AppDatabase): Promise<void> {
  await saveSnapshotTo(await database(), state);
}

function queueWrite(state: AppDatabase): void {
  if (!desktop) return;

  writeChain = writeChain
    .then(
      () => writeState(state),
      () => writeState(state),
    )
    .catch((error: unknown) => {
      reportPersistError(error);
    });
}

function commit(next: AppDatabase): void {
  snapshot = next;
  emit();
  queueWrite(next);
}

function requireDatabase(): AppDatabase {
  if (!snapshot) {
    throw new Error("本地词库还在加载，请稍后再试");
  }
  return snapshot;
}

/** 幂等：任何页面都可以调用，只有第一次真正打开 SQLite。 */
export function ensureLoaded(): Promise<void> {
  if (snapshot) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      desktop = isTauri();

      if (!desktop) {
        /* 浏览器里只保留内存快照：桌面端才是唯一的持久化入口 */
        snapshot = createEmptyDatabase();
        return;
      }

      /* 读不出来（或全新安装）时以空库继续，但不要立刻把空库写回去：
         磁盘上原来的内容可能只是暂时读不了，等用户第一次真正改动再覆盖 */
      snapshot = (await readState()) ?? createEmptyDatabase();
    } catch (error) {
      /* 读失败时不要用空库覆盖磁盘数据，只让界面以空库继续运行 */
      reportPersistError(error);
      snapshot = createEmptyDatabase();
    } finally {
      emit();
    }
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export function replaceDatabase(next: AppDatabase): void {
  commit(normalizeDatabase(next) ?? createEmptyDatabase());
}

export function clearDatabase(): void {
  commit(createEmptyDatabase());
}

export function addWord(term: unknown, meaning: unknown): void {
  commit(createWord(requireDatabase(), term, meaning));
}

export function editWord(id: number, term: unknown, meaning: unknown): void {
  commit(updateWord(requireDatabase(), id, term, meaning));
}

export function removeWord(id: number): void {
  commit(deleteWord(requireDatabase(), id));
}

/** 批量删除走同一次 commit：一次写盘。 */
export function removeWords(ids: readonly number[]): void {
  commit(deleteWords(requireDatabase(), ids));
}

/** 批量收录：新词或重排词才写盘。 */
export function intakeWords(intake: ParsedIntake): IntakeSummary {
  const result = applyIntake(requireDatabase(), intake);

  if (result.summary.added.length > 0 || result.summary.requeued.length > 0) {
    commit(result.db);
  }

  return result.summary;
}

export function updateListSize(listSize: number): void {
  commit(setListSize(requireDatabase(), listSize));
}

export function updateFeedbackMode(mode: FeedbackMode): void {
  commit(setFeedbackMode(requireDatabase(), mode));
}

export function markListComplete(index: number): void {
  commit(completeStudyList(requireDatabase(), index));
}

/**
 * 趣味复习答一题就落盘一次：整局中途关窗也不会丢统计。
 * 单词已被删除时纯函数返回同一个快照，这里跳过无意义的写盘。
 */
export function recordReviewResult(wordId: number, correct: boolean): void {
  const current = requireDatabase();
  const next = recordReviewAnswer(current, wordId, correct);

  if (next !== current) commit(next);
}
