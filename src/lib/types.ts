/** 趣味复习里一个词的累计记录；跟着单词走，删词即消失 */
export type ReviewStat = {
  /** 被问到过多少次（对错都算） */
  seen: number;
  /** 其中答对多少次 */
  correct: number;
  /** 最近一次复习时间（无论对错） */
  lastReviewedAt: string;
  /** 最近一次答错时间；从未答错为 null */
  lastWrongAt: string | null;
};

export type WordRecord = {
  id: number;
  term: string;
  meaning: string;
  createdAt: string;
  updatedAt: string;
  /** 这个词最近一次随清单练完的时间；null = 还没练过 */
  completedAt: string | null;
  /**
   * Anki 最近一次抓取这个词的时间，只用来识别「重发」与「又忘了」；
   * null / 缺失 = 没有时间戳（手工添加、旧插件、手工粘贴）
   */
  lastCapturedAt?: string | null;
  /** 趣味复习的累计记录；从未复习为 null / 缺失 */
  review?: ReviewStat | null;
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

/** 从 Anki 送来的一条待收录明细 */
export type IntakeEntry = {
  term: string;
  meaning: string;
  /** 插件侧的抓取时间（可选：手工粘贴没有） */
  capturedAt?: string;
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
  /** 库里已有、但抓取时间不比库里新：只去重，不挪位 */
  duplicates: string[];
  /** 库里已有、且是新的一次抓取：已挪到队尾并清掉完成标记 */
  requeued: string[];
  rejected: RejectedEntry[];
};

/**
 * 浏览器本地的完整数据包。它是 IndexedDB 里唯一的一条记录，
 * 也是导出文件的内容形态。
 */
export type AppDatabase = {
  version: 3;
  /** 顺序就是 FIFO 队列：清单按这个顺序切分，重排也只动这个数组 */
  words: WordRecord[];
  settings: AppSettings;
};
