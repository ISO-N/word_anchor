import { MAX_MEANING_LENGTH, MAX_TERM_LENGTH } from "@/lib/data";
import type {
  IntakeEntry,
  IntakeSummary,
  ParsedIntake,
  RejectedEntry,
} from "@/lib/types";

/**
 * 收录的「线格式」v1：本机 HTTP API 的 JSON body。
 *
 *   {"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的","capturedAt":"2024-05-01T09:00:00.000+00:00"}]}
 *
 * `capturedAt` 是可选字段：词锚靠它区分「重发」（时间没变）与「又忘了」（时间更新）。
 * 同一份契约有三处实现，任何字段变动都必须同时改：
 *   - 浏览器侧：这个文件
 *   - Rust 侧：`src-tauri/src/api.rs`（校验后再写进 inbox）
 *   - Anki 插件：`anki-addon/word_anchor_sync/wire.py`
 *
 * 三边各有一份单测，并用同一段 fixture 锁住格式。
 */
export const WIRE_VERSION = 1;
export const WIRE_SOURCE = "anki";

/** 一次推送的条数上限 */
export const MAX_ENTRIES = 200;
/** body 上限 512KB */
export const MAX_BODY_BYTES = 512 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 编码一个批次（测试与排障用；插件那边用 Python 产出同样的字符串）。
 * 超过条数上限时只取前 200 条，与 wire.py 的截断行为一致。
 */
export function encodeIntakeBody(entries: readonly IntakeEntry[]): string {
  return JSON.stringify({
    v: WIRE_VERSION,
    source: WIRE_SOURCE,
    words: entries.slice(0, MAX_ENTRIES).map((entry) => ({
      term: entry.term.slice(0, MAX_TERM_LENGTH),
      meaning: entry.meaning.slice(0, MAX_MEANING_LENGTH),
      ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
    })),
  });
}

/**
 * 解析收件箱里的一份 payload。
 *
 * 结构性问题（不是 JSON、版本不对、整批超限）直接抛错——这类 payload 是坏的，
 * 留着只会每次启动都报一遍，调用方应当把文件移走。
 * 单条记录形状不对则记进 rejected，不连坐整批。
 */
export function parseIntakeBody(raw: string): ParsedIntake {
  const text = raw.trim();
  if (!text) {
    throw new Error("收件箱里的内容是空的");
  }
  if (byteLength(text) > MAX_BODY_BYTES) {
    throw new Error("这次要收录的内容太多了，请分成几批发送");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("收录内容无法解码");
  }

  if (!isRecord(parsed)) {
    throw new Error("收录内容无法解码");
  }
  if (parsed.v !== WIRE_VERSION) {
    throw new Error("收录内容的版本不受支持，请更新 Anki 插件");
  }
  if (typeof parsed.source === "string" && parsed.source !== WIRE_SOURCE) {
    throw new Error("收录来源不受支持");
  }
  if (!Array.isArray(parsed.words) || parsed.words.length === 0) {
    throw new Error("收件箱里没有可收录的单词");
  }
  if (parsed.words.length > MAX_ENTRIES) {
    throw new Error(`一次最多收录 ${MAX_ENTRIES} 个单词`);
  }

  const entries: IntakeEntry[] = [];
  const rejected: RejectedEntry[] = [];

  parsed.words.forEach((item) => {
    if (!isRecord(item) || typeof item.term !== "string") {
      rejected.push({ term: "", reason: "格式无法识别" });
      return;
    }

    entries.push({
      term: item.term,
      meaning: typeof item.meaning === "string" ? item.meaning : "",
      /* 抓取时间是可选的：没有它就识别不出重发，但不影响收录 */
      ...(typeof item.capturedAt === "string" && item.capturedAt
        ? { capturedAt: item.capturedAt }
        : {}),
    });
  });

  return { entries, rejected };
}

/** 横幅与面板共用的一句话报数，保证口径一致 */
export function describeIntake(summary: IntakeSummary): string {
  const added = summary.added.length;
  const requeued = summary.requeued.length;
  const duplicates = summary.duplicates.length;
  const rejected = summary.rejected.length;
  const parts: string[] = [];

  if (added > 0) {
    parts.push(`已收录 ${added} 个单词`);
  }
  if (requeued > 0) {
    parts.push(`${requeued} 个单词重新排到了队尾`);
  }
  if (added === 0 && requeued === 0) {
    parts.push(
      duplicates > 0
        ? `这 ${duplicates} 个单词都已在词库中，没有新增`
        : "没有收录到单词",
    );
  } else if (duplicates > 0) {
    parts.push(`跳过 ${duplicates} 个已在词库中`);
  }
  if (rejected > 0) {
    parts.push(`${rejected} 条无法收录`);
  }

  return `${parts.join("，")}。`;
}
