import {
  DATABASE_VERSION,
  DEFAULT_FEEDBACK_MODE,
  DEFAULT_LIST_SIZE,
  MAX_LIST_SIZE,
  MIN_LIST_SIZE,
} from "@/lib/data";
import type {
  AppDatabase,
  CompletionRecord,
  FeedbackMode,
  WordRecord,
} from "@/lib/types";

const BACKUP_APP = "word-anchor";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toWordRecord(value: unknown): WordRecord | null {
  if (!isRecord(value)) return null;

  const { id, term, meaning, createdAt, updatedAt } = value;
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
  };
}

function toCompletionRecord(value: unknown): CompletionRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.completedAt !== "string") return null;

  const attempts = Number(value.attempts);
  const mistakes = Number(value.mistakes);

  return {
    completedAt: value.completedAt,
    attempts: Number.isFinite(attempts) ? Math.max(1, Math.trunc(attempts)) : 1,
    mistakes: Number.isFinite(mistakes) ? Math.max(0, Math.trunc(mistakes)) : 0,
  };
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
 * 宽松解析：用于从 IndexedDB 读回数据（容忍旧版本/损坏字段），
 * 无法识别时返回 null，绝不抛错。
 */
export function normalizeDatabase(value: unknown): AppDatabase | null {
  if (!isRecord(value) || !Array.isArray(value.words)) return null;

  const words = value.words
    .map(toWordRecord)
    .filter((word): word is WordRecord => word !== null)
    .sort((a, b) => a.id - b.id);

  const completions: Record<string, CompletionRecord> = {};
  if (isRecord(value.completions)) {
    Object.entries(value.completions).forEach(([signature, record]) => {
      const normalized = toCompletionRecord(record);
      if (signature && normalized) completions[signature] = normalized;
    });
  }

  const settings = isRecord(value.settings) ? value.settings : {};

  return {
    version: DATABASE_VERSION,
    words,
    settings: {
      listSize: toListSize(settings.listSize),
      feedbackMode: toFeedbackMode(settings.feedbackMode),
    },
    completions,
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
      completions: db.completions,
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
