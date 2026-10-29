import type {
  IntakeEntry,
  IntakeSummary,
  ParsedIntake,
  RejectedEntry,
} from "@/lib/types";

/**
 * 收录的「线格式」v1。
 *
 * 一份 payload 长这样：
 *   {"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的","capturedAt":"2024-05-01T09:00:00.000+00:00"}]}
 * `capturedAt` 是可选字段：词锚靠它区分「重发」（时间没变）与「又忘了」（时间更新）。
 * 编码是 UTF-8 的 base64url（无 padding）。
 *
 * 两条通道共用同一份编码：
 *   - 剪贴板：首行 `word-anchor:v1`，其余行是编码串
 *   - 深链：`https://…/#inbox=<编码串>`
 *
 * Anki 插件那一侧的实现是 `anki-addon/word_anchor_sync/wire.py`，
 * 两边任何一个字段变动都必须同时改，并有各自的单测守住。
 */
export const WIRE_PREFIX = "word-anchor:v1";

const WIRE_VERSION = 1;
const MAX_ENTRIES = 200;
const MAX_PAYLOAD_CHARS = 12000;
const INBOX_HASH_PREFIX = "#inbox=";

/** payload 太大时浏览器/Anki 都难处理，直接拒绝而不是截断 */
function assertPayloadSize(payload: string): void {
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error("这次要收录的内容太多了，请分成几批发送");
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(payload: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new Error("收录内容无法解码");
  }

  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** 编码一个批次（测试与未来的「导出给 Anki」用得上） */
export function encodeInboxPayload(entries: IntakeEntry[]): string {
  return toBase64Url(
    JSON.stringify({
      v: WIRE_VERSION,
      source: "anki",
      words: entries.map((entry) => ({
        term: entry.term,
        meaning: entry.meaning,
        ...(entry.capturedAt ? { capturedAt: entry.capturedAt } : {}),
      })),
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 解码深链里的 payload。结构性问题（编码、版本、条数）直接抛错，
 * 单条记录形状不对则记进 rejected，不连坐整批。
 */
export function decodeInboxPayload(encoded: string): ParsedIntake {
  const payload = encoded.replace(/\s+/g, "");
  if (!payload) {
    throw new Error("链接里没有收录内容");
  }
  assertPayloadSize(payload);

  let text: string;
  try {
    text = fromBase64Url(payload);
  } catch {
    throw new Error("收录内容无法解码");
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
    throw new Error("收录内容的版本不受支持，请先更新页面");
  }
  if (!Array.isArray(parsed.words) || parsed.words.length === 0) {
    throw new Error("链接里没有可收录的单词");
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
      // 抓取时间是可选字段：旧版插件没有它，识别不出重发也不影响收录
      ...(typeof item.capturedAt === "string" && item.capturedAt
        ? { capturedAt: item.capturedAt }
        : {}),
    });
  });

  return { entries, rejected };
}

/** 从 `location.hash` 里取出编码串，不是收录链接时返回 null */
export function extractInboxHash(hash: string): string | null {
  if (!hash.startsWith(INBOX_HASH_PREFIX)) return null;

  const encoded = hash.slice(INBOX_HASH_PREFIX.length);
  return encoded ? encoded : null;
}

/**
 * 粘贴框的解析：优先认插件写的信封，其次按「单词<Tab>释义」逐行读。
 * 手工粘贴永远不该炸掉界面，所以只有信封解码失败才抛错。
 */
export function parseIntakeText(raw: string): ParsedIntake {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return { entries: [], rejected: [] };

  const lines = text.split("\n");

  if (lines[0].trim().toLowerCase() === WIRE_PREFIX) {
    const payload = lines.slice(1).join("").trim();
    if (!payload) {
      throw new Error("收录内容不完整，请在 Anki 里重新复制一次");
    }
    return decodeInboxPayload(payload);
  }

  const entries: IntakeEntry[] = [];
  const rejected: RejectedEntry[] = [];

  lines.forEach((line) => {
    const value = line.trim();
    if (!value) return;

    const tab = value.indexOf("\t");
    if (tab <= 0) {
      rejected.push({ term: value.slice(0, 40), reason: "这一行缺少 Tab 分隔" });
      return;
    }

    entries.push({
      term: value.slice(0, tab),
      meaning: value.slice(tab + 1),
    });
  });

  return { entries, rejected };
}

/** 横幅与面板共用的一句话报数，保证两处口径一致 */
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
