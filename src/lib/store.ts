import {
  applyIntake,
  completeStudyList,
  createEmptyDatabase,
  createWord,
  deleteWord,
  setFeedbackMode,
  setListSize,
  updateWord,
} from "@/lib/data";
import { normalizeDatabase } from "@/lib/backup";
import type {
  AppDatabase,
  FeedbackMode,
  IntakeSummary,
  ParsedIntake,
} from "@/lib/types";

const DATABASE_NAME = "word-anchor";
const STORE_NAME = "state";
const STATE_KEY = "main";
const CHANNEL_NAME = "word-anchor:state";

/**
 * 浏览器端的“数据库”。
 *
 * 内存里只有一份不可变快照，所有读取都走 `getSnapshot()`，
 * 所有写入都是「算出新快照 → 立刻通知 React → 排队落盘到 IndexedDB」。
 * 这样界面永远是同步响应的，持久化失败也不会阻塞交互。
 */

let snapshot: AppDatabase | null = null;
let persistError: string | null = null;
let loadPromise: Promise<void> | null = null;
let databasePromise: Promise<IDBDatabase> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let channel: BroadcastChannel | null = null;

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

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地数据库（IndexedDB）"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开本地数据库"));
    request.onblocked = () =>
      reject(new Error("本地数据库被其他标签页占用，请关闭后重试"));
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });

  databasePromise = promise;
  return promise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读回本地数据；`upgraded` 表示磁盘上还是旧版本，迁移后的快照应该落盘一次，
 * 否则每次打开页面都要从 v1 重新迁移（重排过的时间戳会被旧记录拉回去）。
 */
async function readState(): Promise<{
  state: AppDatabase | null;
  upgraded: boolean;
}> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    let request: IDBRequest;
    try {
      request = database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(STATE_KEY);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => {
      const state = normalizeDatabase(request.result);
      const storedVersion = isRecord(request.result)
        ? Number(request.result.version)
        : Number.NaN;

      resolve({
        state,
        upgraded:
          state !== null &&
          (storedVersion !== state.version ||
            (isRecord(request.result) && isRecord(request.result.completions))),
      });
    };
    request.onerror = () =>
      reject(request.error ?? new Error("读取本地数据失败"));
  });
}

async function writeState(state: AppDatabase): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
    } catch (error) {
      reject(error);
      return;
    }

    transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("写入本地数据失败"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("写入本地数据被中断"));
  });
}

function queueWrite(state: AppDatabase): void {
  writeChain = writeChain.then(
    () => writeState(state),
    () => writeState(state),
  ).catch((error: unknown) => {
    reportPersistError(error);
  });
}

function connectChannel(): void {
  if (channel || typeof BroadcastChannel === "undefined") return;

  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent) => {
    const incoming = normalizeDatabase(
      (event.data as { state?: unknown } | null)?.state,
    );
    if (!incoming) return;
    snapshot = incoming;
    emit();
  };
}

function broadcast(state: AppDatabase): void {
  channel?.postMessage({ state });
}

function commit(next: AppDatabase): void {
  snapshot = next;
  emit();
  queueWrite(next);
  broadcast(next);
}

function requireDatabase(): AppDatabase {
  if (!snapshot) {
    throw new Error("本地词库还在加载，请稍后再试");
  }
  return snapshot;
}

/** 幂等：任何页面都可以调用，只有第一次真正读 IndexedDB。 */
export function ensureLoaded(): Promise<void> {
  if (snapshot) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const stored = await readState();
      connectChannel();

      if (stored.state) {
        snapshot = stored.state;
        if (stored.upgraded) queueWrite(snapshot);
      } else {
        snapshot = createEmptyDatabase();
        queueWrite(snapshot);
      }
    } catch (error) {
      // 读取失败时不要用空库覆盖磁盘数据，只让界面以空库继续运行。
      reportPersistError(error);
      snapshot = createEmptyDatabase();
      connectChannel();
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

/**
 * 批量收录：新词或重排词才写盘、广播，免得无意义地扰动其他标签页。
 */
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
