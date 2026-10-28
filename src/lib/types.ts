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
