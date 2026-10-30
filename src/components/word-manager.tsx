"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Pager } from "@/components/ui/pager";
import { MAX_MEANING_LENGTH, MAX_TERM_LENGTH } from "@/lib/data";
import { formatIndex, formatListLabel, formatShortDate } from "@/lib/format";
import { paginate, parsePageParam } from "@/lib/pagination";
import { addWord, editWord, removeWord, removeWords } from "@/lib/store";
import type { WordRecord } from "@/lib/types";
import { usePageReveal } from "@/lib/use-page-reveal";
import styles from "./word-manager.module.css";

const SEARCH_DEBOUNCE_MS = 250;
/** 批量删除对话框里最多列几个词，剩下的折成「等 N 个」 */
const BULK_PREVIEW_LIMIT = 8;

type FormState = { term: string; meaning: string };
type FieldErrors = { term?: string; meaning?: string };

const EMPTY_FORM: FormState = { term: "", meaning: "" };

/** 入场延迟：标题 0，摘要 1，表格 2 */
const rise = (step: number): CSSProperties =>
  ({ "--i": step }) as CSSProperties;

export function WordManager({
  words,
  listIndexByWordId,
  intro,
}: {
  words: WordRecord[];
  /** 单词 ID → 所在清单编号，与清单页同源（含全部单词，与搜索无关） */
  listIndexByWordId: Map<number, number>;
  /** 标题下方的插槽：目前用于「从 Anki 快速收录」 */
  intro?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";
  const page = parsePageParam(searchParams.get("page"));

  const [query, setQuery] = useState(urlQuery);
  const writtenQuery = useRef(urlQuery);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<WordRecord | null>(null);
  /**
   * 批量删除的选中项：id → 单词本身。
   * 记 term 是为了让 id 被新词复用时不会悄悄选中别人；跳页、换搜索词都不清空。
   */
  const [selectedTerms, setSelectedTerms] = useState<Map<number, string>>(
    () => new Map(),
  );
  /** 打开确认框时冻结的一份快照：对话框里看到的就是点下去那一刻的选中项 */
  const [bulkTargets, setBulkTargets] = useState<WordRecord[] | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [notice, setNotice] = useState("");
  /** 打开表单时把焦点交给谁：触屏落在「取消」，避免直接弹出软键盘 */
  const [focusTarget, setFocusTarget] = useState<"term" | "cancel">(
    "cancel",
  );

  const termRef = useRef<HTMLInputElement | null>(null);
  const meaningRef = useRef<HTMLInputElement | null>(null);
  const formCancelRef = useRef<HTMLButtonElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const bulkCancelRef = useRef<HTMLButtonElement | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  /* 浏览器前进/后退 → 输入框 */
  useEffect(() => {
    if (urlQuery === writtenQuery.current) return;
    writtenQuery.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery]);

  /* 输入框 → URL（去抖；换搜索词回到第 1 页） */
  useEffect(() => {
    if (query === urlQuery) return;

    const timer = window.setTimeout(() => {
      writtenQuery.current = query;
      replaceParams((params) => {
        if (query.trim()) params.set("q", query);
        else params.delete("q");
        params.delete("page");
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, urlQuery, replaceParams]);

  const filteredWords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return words;
    return words.filter(
      (word) =>
        word.term.toLowerCase().includes(normalized) ||
        word.meaning.toLowerCase().includes(normalized),
    );
  }, [words, query]);

  const pageData = useMemo(
    () => paginate(filteredWords, page),
    [filteredWords, page],
  );

  /* 选中项按词库顺序展开，删除时传的 id 因此是稳定的升序 */
  const selectedWords = useMemo(
    () => words.filter((word) => selectedTerms.get(word.id) === word.term),
    [words, selectedTerms],
  );

  const pageSelectedCount = useMemo(
    () =>
      pageData.items.filter(
        (word) => selectedTerms.get(word.id) === word.term,
      ).length,
    [pageData.items, selectedTerms],
  );

  const allPageSelected =
    pageData.items.length > 0 && pageSelectedCount === pageData.items.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;
  /** 选中了但不在本页：提示一下，避免删掉看不见的词 */
  const hiddenSelectedCount = selectedWords.length - pageSelectedCount;
  const hasUnselectedFiltered = filteredWords.some(
    (word) => selectedTerms.get(word.id) !== word.term,
  );
  const bulkCount = bulkTargets?.length ?? 0;

  const tableRef = useRef<HTMLDivElement | null>(null);
  const requestReveal = usePageReveal(pageData.page, tableRef);

  /* indeterminate 没有对应的 JSX 属性，只能命令式设置 */
  useEffect(() => {
    const input = selectAllRef.current;
    if (input) input.indeterminate = somePageSelected;
  }, [somePageSelected]);

  /* 序号按词库全序计算，不再在 map 里 findIndex（O(n²)） */
  const orderById = useMemo(
    () => new Map(words.map((word, index) => [word.id, index + 1])),
    [words],
  );

  function goToPage(nextPage: number) {
    if (nextPage === pageData.page) return;

    requestReveal();
    replaceParams((params) => {
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
    });
  }

  /* 只在桌面键盘环境下自动聚焦，避免移动端弹出键盘 */
  function wantsFieldFocus(): boolean {
    return window.matchMedia("(pointer: fine)").matches;
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError("");
    setFocusTarget(wantsFieldFocus() ? "term" : "cancel");
    setFormOpen(true);
  }

  function openEdit(word: WordRecord) {
    setEditingId(word.id);
    setForm({ term: word.term, meaning: word.meaning });
    setErrors({});
    setFormError("");
    setFocusTarget(wantsFieldFocus() ? "term" : "cancel");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");

    const term = form.term.trim();
    const meaning = form.meaning.trim();
    const nextErrors: FieldErrors = {};

    if (!term) nextErrors.term = "请输入单词，例如 serendipity。";
    else if (term.length > MAX_TERM_LENGTH)
      nextErrors.term = `单词不能超过 ${MAX_TERM_LENGTH} 个字符。`;

    if (!meaning) nextErrors.meaning = "请输入释义。";
    else if (meaning.length > MAX_MEANING_LENGTH)
      nextErrors.meaning = `释义不能超过 ${MAX_MEANING_LENGTH} 个字符。`;

    if (nextErrors.term || nextErrors.meaning) {
      setErrors(nextErrors);
      (nextErrors.term ? termRef : meaningRef).current?.focus();
      return;
    }

    setErrors({});

    try {
      if (editingId) editWord(editingId, term, meaning);
      else addWord(term, meaning);
      closeForm();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "保存失败";

      if (message.includes("已经在词库")) {
        setErrors({ term: "这个单词已经在词库中了。" });
        termRef.current?.focus();
        return;
      }

      setFormError(message);
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;

    setNotice("");

    try {
      removeWord(pendingDelete.id);
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "删除失败",
      );
    } finally {
      setPendingDelete(null);
    }
  }

  function toggleWordSelection(word: WordRecord, selected: boolean) {
    setNotice("");
    setSelectedTerms((current) => {
      const next = new Map(current);
      if (selected) next.set(word.id, word.term);
      else next.delete(word.id);
      return next;
    });
  }

  function togglePageSelection(selected: boolean) {
    setNotice("");
    setSelectedTerms((current) => {
      const next = new Map(current);
      pageData.items.forEach((word) => {
        if (selected) next.set(word.id, word.term);
        else next.delete(word.id);
      });
      return next;
    });
  }

  /** 全选当前筛选结果（搜索时就是「全部搜索结果」）；已有的选中不丢 */
  function selectAllFiltered() {
    setNotice("");
    setSelectedTerms((current) => {
      const next = new Map(current);
      filteredWords.forEach((word) => next.set(word.id, word.term));
      return next;
    });
  }

  function clearSelection() {
    setNotice("");
    setSelectedTerms(new Map());
  }

  function openBulkDelete() {
    if (selectedWords.length === 0) return;
    setBulkError("");
    setNotice("");
    setBulkTargets(selectedWords);
  }

  function closeBulkDelete() {
    setBulkTargets(null);
    setBulkError("");
  }

  function confirmBulkDelete() {
    if (!bulkTargets) return;
    const ids = bulkTargets.map((word) => word.id);

    try {
      removeWords(ids);
      setBulkTargets(null);
      setBulkError("");
      setSelectedTerms(new Map());
      setNotice(`已删除 ${ids.length} 个单词。`);
    } catch (caught) {
      setBulkError(caught instanceof Error ? caught.message : "删除失败");
    }
  }

  return (
    <>
      <section className={`rise page-heading`} style={rise(0)}>
        <div>
          <h1>单词库</h1>
          <p className="page-description">
            每一个学过的词，都从这里开始沉淀。
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/lists" className={buttonClass({ variant: "ghost" })}>
            <BookOpen size={16} strokeWidth={1.9} aria-hidden="true" />
            查看清单
          </Link>
          <button type="button" className={buttonClass()} onClick={openCreate}>
            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
            添加单词
          </button>
        </div>
      </section>

      {intro}

      <div className={`rise ${styles.summary}`} style={rise(1)}>
        <p className={styles.count}>
          <strong>{words.length}</strong>
          {words.length === 0 ? "个单词等着被记下" : "个单词"}
        </p>

        <div className={styles.search}>
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <label className="sr-only" htmlFor="word-search">
            搜索单词或释义
          </label>
          <input
            id="word-search"
            className={styles.searchInput}
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词或释义…"
          />
          {query && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => setQuery("")}
              aria-label="清除搜索"
            >
              <X size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p className={styles.notice} role="status" aria-live="polite">
          {notice}
        </p>
      )}

      {selectedWords.length > 0 && (
        <div className={styles.bulkBar} role="group" aria-label="批量删除">
          <p className={styles.bulkCount} role="status" aria-live="polite">
            已选 <strong>{selectedWords.length}</strong> 个词
            {hiddenSelectedCount > 0 && (
              <span className={styles.bulkHint}>
                （{hiddenSelectedCount} 个不在当前页或搜索结果中）
              </span>
            )}
          </p>

          <div className={styles.bulkActions}>
            {hasUnselectedFiltered && (
              <button
                type="button"
                className={buttonClass({ variant: "ghost", size: "sm" })}
                onClick={selectAllFiltered}
              >
                选中全部 {filteredWords.length} 个单词
              </button>
            )}
            <button
              type="button"
              className={buttonClass({ variant: "ghost", size: "sm" })}
              onClick={clearSelection}
            >
              清空选择
            </button>
            <button
              type="button"
              className={buttonClass({ variant: "danger", size: "sm" })}
              onClick={openBulkDelete}
            >
              <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
              删除选中
            </button>
          </div>
        </div>
      )}

      {words.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <BookOpen size={22} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h2>词库还是空的</h2>
          <p>从第一个想记住的单词开始吧。</p>
          <button type="button" className={buttonClass()} onClick={openCreate}>
            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
            添加第一个单词
          </button>
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <h2>没有找到相关单词</h2>
          <p>换个关键词试试，或清除搜索条件。</p>
          <button
            type="button"
            className={buttonClass({ variant: "ghost" })}
            onClick={() => setQuery("")}
          >
            清除搜索
          </button>
        </div>
      ) : (
        <div
          ref={tableRef}
          className={`rise ${styles.tableWrap}`}
          style={rise(2)}
          role="region"
          aria-label={`单词列表，第 ${pageData.page} 页`}
          tabIndex={-1}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colSelect} scope="col">
                  <label className={styles.selectCellLabel}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className={styles.checkbox}
                      aria-label="选中本页全部单词"
                      checked={allPageSelected}
                      onChange={(event) =>
                        togglePageSelection(event.target.checked)
                      }
                    />
                  </label>
                </th>
                <th className={styles.colIndex} scope="col">
                  #
                </th>
                <th className={styles.colTerm} scope="col">
                  单词
                </th>
                <th className={styles.colMeaning} scope="col">
                  释义
                </th>
                <th className={styles.colReview} scope="col">
                  复习
                </th>
                <th className={styles.colList} scope="col">
                  清单
                </th>
                <th className={styles.colDate} scope="col">
                  加入时间
                </th>
                <th className={styles.colActions} scope="col">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((word) => {
                const listIndex = listIndexByWordId.get(word.id);
                const isSelected = selectedTerms.get(word.id) === word.term;

                return (
                  <tr
                    key={word.id}
                    className={isSelected ? styles.rowSelected : undefined}
                  >
                    <td className={styles.colSelect}>
                      <label className={styles.selectCellLabel}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          aria-label={`选择 ${word.term}`}
                          checked={isSelected}
                          onChange={(event) =>
                            toggleWordSelection(word, event.target.checked)
                          }
                        />
                      </label>
                    </td>
                    <td className={styles.colIndex}>
                      {formatIndex(orderById.get(word.id) ?? 0)}
                    </td>
                    <td className={styles.colTerm}>
                      <span className={styles.term} lang="en" translate="no">
                        {word.term}
                      </span>
                    </td>
                    <td className={styles.colMeaning}>
                      <span className={styles.meaning}>{word.meaning}</span>
                    </td>
                    <td className={styles.colReview}>
                      {word.review && word.review.seen > 0 ? (
                        <span
                          className={styles.reviewStat}
                          aria-label={`已复习 ${word.review.seen} 次，答对 ${word.review.correct} 次`}
                        >
                          {word.review.correct}/{word.review.seen}
                          <span className={styles.reviewRate}>
                            {Math.round(
                              (word.review.correct / word.review.seen) * 100,
                            )}
                            %
                          </span>
                        </span>
                      ) : (
                        <span className={styles.reviewEmpty}>—</span>
                      )}
                    </td>
                    <td className={styles.colList}>
                      {listIndex !== undefined && (
                        <Link
                          href={`/practice/?list=${listIndex}&from=words`}
                          className={styles.listLink}
                          translate="no"
                          aria-label={`${formatListLabel(listIndex)}，含 ${word.term}，进入连线练习`}
                        >
                          <span className={styles.listPrefix}>LIST</span>
                          <span className={styles.listNumber}>
                            {formatIndex(listIndex)}
                          </span>
                          <ArrowUpRight
                            className={styles.listArrow}
                            size={13}
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                        </Link>
                      )}
                    </td>
                    <td className={styles.colDate}>
                      {formatShortDate(word.createdAt)}
                    </td>
                    <td className={styles.colActions}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowButton}
                          onClick={() => openEdit(word)}
                          aria-label={`编辑 ${word.term}`}
                        >
                          <Pencil size={16} strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.rowButton} ${styles.rowButtonDanger}`}
                          onClick={() => setPendingDelete(word)}
                          aria-label={`删除 ${word.term}`}
                        >
                          <Trash2 size={16} strokeWidth={1.8} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={styles.footer}>
            <span aria-live="polite">
              显示 {pageData.from}–{pageData.to} / 共 {filteredWords.length} 个词
            </span>

            <Pager
              page={pageData.page}
              totalPages={pageData.totalPages}
              onChange={goToPage}
              label="单词分页"
            />
          </div>
        </div>
      )}

      <Dialog
        open={formOpen}
        onClose={closeForm}
        title={editingId ? "调整这个词" : "记下一个新词"}
        description="单词与释义保存在这台电脑的本地词库里。"
        initialFocus={focusTarget === "term" ? termRef : formCancelRef}
      >
        <form onSubmit={submit} noValidate>
          <div className={styles.formGrid}>
            <div className="field">
              <label className="field-label" htmlFor="word-term">
                单词
              </label>
              <input
                ref={termRef}
                id="word-term"
                className="field-input"
                name="term"
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_TERM_LENGTH}
                value={form.term}
                onChange={(event) =>
                  setForm((current) => ({ ...current, term: event.target.value }))
                }
                aria-invalid={Boolean(errors.term)}
                aria-describedby={errors.term ? "word-term-error" : undefined}
                placeholder="serendipity…"
              />
              {errors.term && (
                <p className="field-error" id="word-term-error" role="alert">
                  {errors.term}
                </p>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="word-meaning">
                释义
              </label>
              <input
                ref={meaningRef}
                id="word-meaning"
                className="field-input"
                name="meaning"
                autoComplete="off"
                maxLength={MAX_MEANING_LENGTH}
                value={form.meaning}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    meaning: event.target.value,
                  }))
                }
                aria-invalid={Boolean(errors.meaning)}
                aria-describedby={
                  errors.meaning ? "word-meaning-error" : undefined
                }
                placeholder="意外发现美好事物的运气…"
              />
              {errors.meaning && (
                <p className="field-error" id="word-meaning-error" role="alert">
                  {errors.meaning}
                </p>
              )}
            </div>
          </div>

          {formError && (
            <p className={`field-error ${styles.formError}`} role="alert">
              {formError}
            </p>
          )}

          <div className={styles.formFoot}>
            <button
              ref={formCancelRef}
              type="button"
              className={buttonClass({ variant: "ghost" })}
              onClick={closeForm}
            >
              取消
            </button>
            <button type="submit" className={buttonClass()}>
              {editingId ? "保存修改" : "加入词库"}
              <ArrowRight size={15} strokeWidth={1.8} />
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="删除这个单词？"
        description={
          pendingDelete ? (
            <>
              <strong translate="no">{pendingDelete.term}</strong>{" "}
              会从词库中移除，之后的学习清单会重新编排。
            </>
          ) : (
            "这个词会从词库中移除。"
          )
        }
        initialFocus={deleteCancelRef}
        footer={
          <>
            <button
              ref={deleteCancelRef}
              type="button"
              className={buttonClass({ variant: "ghost" })}
              onClick={() => setPendingDelete(null)}
            >
              再想想
            </button>
            <button
              type="button"
              className={buttonClass({ variant: "danger" })}
              onClick={confirmDelete}
            >
              确认删除
            </button>
          </>
        }
      />

      <Dialog
        open={bulkTargets !== null}
        onClose={closeBulkDelete}
        title={`删除选中的 ${bulkCount} 个单词？`}
        description={`这 ${bulkCount} 个词会从词库中移除，之后的学习清单会重新编排。`}
        initialFocus={bulkCancelRef}
        footer={
          <>
            <button
              ref={bulkCancelRef}
              type="button"
              className={buttonClass({ variant: "ghost" })}
              onClick={closeBulkDelete}
            >
              再想想
            </button>
            <button
              type="button"
              className={buttonClass({ variant: "danger" })}
              onClick={confirmBulkDelete}
            >
              删除 {bulkCount} 个词
            </button>
          </>
        }
      >
        <p className={styles.dialogTerms}>
          {(bulkTargets ?? [])
            .slice(0, BULK_PREVIEW_LIMIT)
            .map((word, index) => (
              <span key={word.id}>
                {index > 0 && "、"}
                <span translate="no">{word.term}</span>
              </span>
            ))}
          {bulkCount > BULK_PREVIEW_LIMIT && ` 等 ${bulkCount} 个`}
        </p>

        {bulkError && (
          <p className="field-error" role="alert">
            {bulkError}
          </p>
        )}
      </Dialog>
    </>
  );
}
