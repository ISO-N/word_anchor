"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatShortDate } from "@/lib/format";
import { paginate, parsePageParam } from "@/lib/pagination";
import { addWord, editWord, removeWord } from "@/lib/store";
import type { WordRecord } from "@/lib/types";
import styles from "./word-manager.module.css";

const SEARCH_DEBOUNCE_MS = 250;
const MAX_TERM_LENGTH = 80;
const MAX_MEANING_LENGTH = 300;

type FormState = { term: string; meaning: string };
type FieldErrors = { term?: string; meaning?: string };

const EMPTY_FORM: FormState = { term: "", meaning: "" };

export function WordManager({ words }: { words: WordRecord[] }) {
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

  const termRef = useRef<HTMLInputElement | null>(null);
  const meaningRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

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

  /* 序号按词库全序计算，不再在 map 里 findIndex（O(n²)） */
  const orderById = useMemo(
    () => new Map(words.map((word, index) => [word.id, index + 1])),
    [words],
  );

  function goToPage(nextPage: number) {
    replaceParams((params) => {
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(word: WordRecord) {
    setEditingId(word.id);
    setForm({ term: word.term, meaning: word.meaning });
    setErrors({});
    setFormError("");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError("");
  }

  /* 只在桌面键盘环境下自动聚焦，避免移动端弹出键盘 */
  useEffect(() => {
    if (!formOpen) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    termRef.current?.focus();
  }, [formOpen, editingId]);

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

  return (
    <>
      <section className="page-heading">
        <div>
          <h1>单词库</h1>
          <p className="page-description">
            每一个学过的词，都从这里开始沉淀。
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/lists" className={buttonClass({ variant: "ghost" })}>
            <BookOpen size={17} strokeWidth={1.8} />
            查看清单
          </Link>
          <button type="button" className={buttonClass()} onClick={openCreate}>
            <Plus size={17} strokeWidth={1.8} />
            添加单词
          </button>
        </div>
      </section>

      <div className={styles.summary}>
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

      {formOpen && (
        <form className={styles.editor} onSubmit={submit} noValidate>
          <div className={styles.editorHead}>
            <h2 className={styles.editorTitle}>
              {editingId ? "调整这个词" : "记下一个新词"}
            </h2>
            <button
              type="button"
              className={styles.rowButton}
              onClick={closeForm}
              aria-label="关闭编辑面板"
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>

          <div className={styles.editorGrid}>
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
            <p className="field-error" role="alert" style={{ marginTop: 12 }}>
              {formError}
            </p>
          )}

          <div className={styles.editorFoot}>
            <span className={styles.editorHint}>
              单词与释义保存在这台设备的浏览器里。
            </span>
            <div className={styles.formActions}>
              <button
                type="button"
                className={buttonClass({ variant: "ghost", size: "sm" })}
                onClick={closeForm}
              >
                取消
              </button>
              <button
                type="submit"
                className={buttonClass({ size: "sm" })}
              >
                {editingId ? "保存修改" : "加入词库"}
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </form>
      )}

      {words.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <BookOpen size={20} strokeWidth={1.8} />
          </span>
          <h2>词库还是空的</h2>
          <p>从第一个想记住的单词开始吧。</p>
          <button type="button" className={buttonClass()} onClick={openCreate}>
            <Plus size={17} strokeWidth={1.8} />
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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colIndex} scope="col">
                  #
                </th>
                <th scope="col">单词</th>
                <th scope="col">释义</th>
                <th className={styles.colDate} scope="col">
                  加入时间
                </th>
                <th className={styles.colActions} scope="col">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((word) => (
                <tr key={word.id}>
                  <td className={styles.colIndex}>
                    {String(orderById.get(word.id) ?? 0).padStart(2, "0")}
                  </td>
                  <td>
                    <span className={styles.term} lang="en" translate="no">
                      {word.term}
                    </span>
                  </td>
                  <td>
                    <span className={styles.meaning}>{word.meaning}</span>
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
              ))}
            </tbody>
          </table>

          <div className={styles.footer}>
            <span>
              显示 {pageData.from}–{pageData.to} / 共 {filteredWords.length} 个词
            </span>

            {pageData.totalPages > 1 && (
              <nav className={styles.pager} aria-label="分页">
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => goToPage(pageData.page - 1)}
                  disabled={pageData.page <= 1}
                >
                  上一页
                </button>
                <span>
                  第 {pageData.page} / {pageData.totalPages} 页
                </span>
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => goToPage(pageData.page + 1)}
                  disabled={pageData.page >= pageData.totalPages}
                >
                  下一页
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

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
        initialFocus={cancelRef}
        footer={
          <>
            <button
              ref={cancelRef}
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
    </>
  );
}
