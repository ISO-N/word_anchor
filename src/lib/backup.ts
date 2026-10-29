import {
  DATABASE_VERSION,
  DEFAULT_FEEDBACK_MODE,
  DEFAULT_LIST_SIZE,
  MAX_LIST_SIZE,
  MIN_LIST_SIZE,
} from "@/lib/data";
import type {
  AppDatabase,
  FeedbackMode,
  ReviewStat,
  WordRecord,
} from "@/lib/types";

const BACKUP_APP = "word-anchor";

/** v1 的完成记录：按清单签名（组内单词 id 串）记账，只用于迁移 */
type LegacyCompletion = { completedAt: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTimestamp(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** 两个时间戳取更晚的那个；ISO 字符串可以直接比大小 */
function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function toReviewStat(value: unknown): ReviewStat | null {
  if (!isRecord(value)) return null;

  const seen = Math.trunc(Number(value.seen));
  const correct = Math.trunc(Number(value.correct));
  const lastReviewedAt = toTimestamp(value.lastReviewedAt);

  /* 没有复习时间、或次数不是正整数：整条记录不可信，当作没复习过 */
  if (!Number.isFinite(seen) || seen <= 0) return null;
  if (!Number.isFinite(correct) || correct < 0) return null;
  if (!lastReviewedAt) return null;

  return {
    seen,
    correct: Math.min(correct, seen),
    lastReviewedAt,
    lastWrongAt: toTimestamp(value.lastWrongAt),
  };
}

function toWordRecord(value: unknown): WordRecord | null {
  if (!isRecord(value)) return null;

  const { id, term, meaning, createdAt, updatedAt, completedAt, lastCapturedAt } =
    value;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  if (typeof term !== "string" || !term) return null;
  if (typeof meaning !== "string") return null;

  const created = typeof createdAt === "string" ? createdAt : new Date().toISOString();

  return {
    id: Math.trunc(id),
    term,
    meaning,
    createdAt: created,
    updatedAt: typeof updatedAt === "string" ? updatedAt : created,
    completedAt: toTimestamp(completedAt),
    lastCapturedAt: toTimestamp(lastCapturedAt),
    review: toReviewStat(value.review),
  };
}

function toLegacyCompletion(value: unknown): LegacyCompletion | null {
  if (!isRecord(value)) return null;

  return typeof value.completedAt === "string"
    ? { completedAt: value.completedAt }
    : null;
}

function toListSize(value: unknown): number {
  const listSize = Number(value);
  if (
    !Number.isInteger(listSize) ||
    listSize < MIN_LIST_SIZE ||
    listSize > MAX_LIST_SIZE
  ) {
    return DEFAULT_LIST_SIZE;
  }
  return listSize;
}

function toFeedbackMode(value: unknown): FeedbackMode {
  return value === "manual" ? "manual" : DEFAULT_FEEDBACK_MODE;
}

/**
 * v1 → v2 迁移：v1 把「这份清单练完了」记在清单签名上，现在按单词记。
 *
 * 用当前的数组顺序与每组单词数重新分组，命中签名的组就给组内每个词补上
 * `completedAt`，于是升级后原有清单仍然是「已完成」。
 *
 * 顺带给缺 `lastCapturedAt` 的词补 `createdAt`：升级后第一次发送带时间戳的
 * 批次不会把存量词整体重排一遍（真的又忘了的词抓取时间一定晚于入库时间）。
 */
function migrateToWordCompletions(
  words: WordRecord[],
  listSize: number,
  completions: Record<string, LegacyCompletion>,
  fromV1: boolean,
): WordRecord[] {
  const inherited = new Map<number, string>();

  if (fromV1) {
    for (let offset = 0; offset < words.length; offset += listSize) {
      const group = words.slice(offset, offset + listSize);
      const record = completions[group.map((word) => word.id).join("-")];
      if (!record) continue;

      group.forEach((word) => inherited.set(word.id, record.completedAt));
    }
  }

  return words.map((word) => ({
    ...word,
    completedAt: laterOf(word.completedAt ?? null, inherited.get(word.id) ?? null),
    lastCapturedAt:
      word.lastCapturedAt ?? (fromV1 ? word.createdAt : null),
  }));
}

/**
 * 宽松解析：用于从 IndexedDB 读回数据（容忍旧版本/损坏字段），
 * 无法识别时返回 null，绝不抛错。
 */
export function normalizeDatabase(value: unknown): AppDatabase | null {
  if (!isRecord(value) || !Array.isArray(value.words)) return null;

  /* 数组顺序就是 FIFO 队列顺序，不再按 id 重排：重排过的词要留在队尾 */
  const parsedWords = value.words
    .map(toWordRecord)
    .filter((word): word is WordRecord => word !== null);

  /* 只有 v1 才需要把「清单签名」摊到单词上，也只有 v1 才用 createdAt 兜底
     抓取时间；v2 → v3 只是补版本号，不能把手工词的 lastCapturedAt 改掉 */
  const fromV1 = Number(value.version) < 2 || isRecord(value.completions);
  const completions: Record<string, LegacyCompletion> = {};
  if (fromV1 && isRecord(value.completions)) {
    Object.entries(value.completions).forEach(([signature, record]) => {
      const normalized = toLegacyCompletion(record);
      if (signature && normalized) completions[signature] = normalized;
    });
  }

  const settings = isRecord(value.settings) ? value.settings : {};
  const listSize = toListSize(settings.listSize);

  return {
    version: DATABASE_VERSION,
    words: migrateToWordCompletions(parsedWords, listSize, completions, fromV1),
    settings: {
      listSize,
      feedbackMode: toFeedbackMode(settings.feedbackMode),
    },
  };
}

/**
 * 严格解析：用于导入用户选择的备份文件，出问题时抛出可读的中文错误。
 */
export function parseBackup(text: string): AppDatabase {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("这个文件不是有效的 JSON");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.words)) {
    throw new Error("这个文件不是词锚的备份文件");
  }

  if (typeof parsed.version === "number" && parsed.version > DATABASE_VERSION) {
    throw new Error("备份文件来自更新版本的词锚，请先更新页面");
  }

  const words = parsed.words
    .map(toWordRecord)
    .filter((word): word is WordRecord => word !== null);

  if (words.length !== parsed.words.length) {
    throw new Error(
      `备份文件中有 ${parsed.words.length - words.length} 条单词记录无法识别`,
    );
  }

  const normalized = normalizeDatabase(parsed);
  if (!normalized) {
    throw new Error("这个文件不是词锚的备份文件");
  }

  return normalized;
}

export function serializeBackup(db: AppDatabase): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: DATABASE_VERSION,
      exportedAt: new Date().toISOString(),
      words: db.words,
      settings: db.settings,
    },
    null,
    2,
  );
}

function backupFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${BACKUP_APP}-${stamp}.json`;
}

export function downloadBackup(db: AppDatabase): void {
  const blob = new Blob([serializeBackup(db)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = backupFileName();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // 让浏览器有机会开始下载后再释放
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
