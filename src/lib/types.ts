export type WordRecord = {
  id: number;
  term: string;
  meaning: string;
  createdAt: string;
  updatedAt: string;
};

export type ListStatus = "ready" | "completed";

export type StudyList = {
  index: number;
  startOrder: number;
  endOrder: number;
  size: number;
  isPartial: boolean;
  status: ListStatus;
  completedAt: string | null;
  signature: string;
  words: WordRecord[];
};

export type FeedbackMode = "instant" | "manual";

/** 练习页的入口来源：决定返回链接回到单词库还是学习清单 */
export type PracticeOrigin = "words" | "lists";

export type AppSettings = {
  listSize: number;
  feedbackMode: FeedbackMode;
};

export type ListOverview = {
  settings: AppSettings;
  words: WordRecord[];
  lists: StudyList[];
};

export type CompletionRecord = {
  completedAt: string;
  attempts: number;
  mistakes: number;
};

/** 从 Anki 送来的一条待收录明细 */
export type IntakeEntry = {
  term: string;
  meaning: string;
};

/** 无法收录的一行：留在汇总里给用户看，不静默丢弃 */
export type RejectedEntry = {
  term: string;
  reason: string;
};

/** 解析后的收录批次（网页自己解析，或解码自插件） */
export type ParsedIntake = {
  entries: IntakeEntry[];
  rejected: RejectedEntry[];
};

/** 一次收录的结果口径：横幅与面板都按这个报数 */
export type IntakeSummary = {
  added: WordRecord[];
  duplicates: string[];
  rejected: RejectedEntry[];
};

/**
 * 浏览器本地的完整数据包。它是 IndexedDB 里唯一的一条记录，
 * 也是导出文件的内容形态。
 */
export type AppDatabase = {
  version: 1;
  words: WordRecord[];
  settings: AppSettings;
  completions: Record<string, CompletionRecord>;
};
