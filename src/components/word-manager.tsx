"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  LibraryBig,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { addWord, editWord, removeWord } from "@/lib/store";
import type { WordRecord } from "@/lib/types";
import { formatShortDate } from "@/lib/format";

type FormState = {
  term: string;
  meaning: string;
};

const emptyForm: FormState = { term: "", meaning: "" };

export function WordManager({ words }: { words: WordRecord[] }) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WordRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");

  const filteredWords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return words;
    return words.filter(
      (word) =>
        word.term.toLowerCase().includes(normalized) ||
        word.meaning.toLowerCase().includes(normalized),
    );
  }, [words, query]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function openEdit(word: WordRecord) {
    setEditingId(word.id);
    setForm({ term: word.term, meaning: word.meaning });
    setError("");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      if (editingId) {
        editWord(editingId, form.term, form.meaning);
      } else {
        addWord(form.term, form.meaning);
      }
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;

    try {
      removeWord(pendingDelete.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <>
      <section className="page-heading words-heading">
        <div>
          <p className="eyebrow">YOUR VOCABULARY</p>
          <h1>单词库</h1>
          <p className="page-description">
            每一个学过的词，都从这里开始沉淀。
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/lists" className="button button-ghost">
            <BookOpen size={17} />
            查看清单
          </Link>
          <button className="button button-primary" onClick={openCreate}>
            <Plus size={18} />
            添加单词
          </button>
        </div>
      </section>

      <div className="words-summary">
        <div className="words-summary-count">
          <span className="summary-icon">
            <LibraryBig size={22} />
          </span>
          <div>
            <strong>{words.length}</strong>
            <span>个单词安静地躺在这里</span>
          </div>
        </div>
        <div className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词或释义…"
            aria-label="搜索单词或释义"
          />
          {query && (
            <button
              className="icon-button icon-button-small"
              onClick={() => setQuery("")}
              aria-label="清除搜索"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <form className="word-editor" onSubmit={submit}>
          <div className="word-editor-heading">
            <div>
              <span className="eyebrow">
                {editingId ? "EDIT WORD" : "NEW WORD"}
              </span>
              <h2>{editingId ? "调整这个词" : "记下一个新词"}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeForm}
              aria-label="关闭"
            >
              <X size={19} />
            </button>
          </div>
          <div className="word-editor-grid">
            <label className="form-field">
              <span>单词</span>
              <input
                autoFocus
                value={form.term}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    term: event.target.value,
                  }))
                }
                placeholder="例如：serendipity"
                maxLength={80}
              />
            </label>
            <label className="form-field">
              <span>释义</span>
              <input
                value={form.meaning}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    meaning: event.target.value,
                  }))
                }
                placeholder="例如：意外发现美好事物的运气"
                maxLength={300}
              />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="word-editor-footer">
            <span>单词与释义会保存在这台设备的浏览器里。</span>
            <div className="form-actions">
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={closeForm}
              >
                取消
              </button>
              <button
                type="submit"
                className="button button-primary button-small"
              >
                {editingId ? "保存修改" : "加入词库"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </form>
      )}

      {words.length === 0 ? (
        <div className="empty-state">
          <span className="empty-illustration">
            <BookOpen size={34} />
          </span>
          <h2>词库还是空的</h2>
          <p>从第一个想记住的单词开始吧。</p>
          <button className="button button-primary" onClick={openCreate}>
            <Plus size={18} />
            添加第一个单词
          </button>
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="empty-state empty-state-small">
          <h2>没有找到相关单词</h2>
          <p>换个关键词试试，或清除搜索条件。</p>
          <button className="button button-ghost" onClick={() => setQuery("")}>
            清除搜索
          </button>
        </div>
      ) : (
        <div className="word-table-wrap">
          <table className="word-table">
            <thead>
              <tr>
                <th className="col-index">#</th>
                <th>单词</th>
                <th>释义</th>
                <th className="col-date">加入时间</th>
                <th className="col-actions">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredWords.map((word) => {
                const originalIndex = words.findIndex(
                  (item) => item.id === word.id,
                );
                return (
                  <tr key={word.id}>
                    <td className="col-index">
                      {String(originalIndex + 1).padStart(2, "0")}
                    </td>
                    <td>
                      <span className="word-term">{word.term}</span>
                    </td>
                    <td>
                      <span className="word-meaning">{word.meaning}</span>
                    </td>
                    <td className="col-date">
                      {formatShortDate(word.createdAt)}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          onClick={() => openEdit(word)}
                          aria-label={`编辑 ${word.term}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button icon-button-danger"
                          onClick={() => setPendingDelete(word)}
                          aria-label={`删除 ${word.term}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-footer">
            <span>
              显示 {filteredWords.length} / {words.length} 个词
            </span>
            <span>清单按加入顺序自动编排</span>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <span className="confirm-icon">
              <Trash2 size={21} />
            </span>
            <h2 id="delete-title">删除这个单词？</h2>
            <p>
              <strong>{pendingDelete.term}</strong> 会从词库中移除，之后的学习清单也会重新编排。
            </p>
            <div className="confirm-actions">
              <button
                className="button button-ghost button-small"
                onClick={() => setPendingDelete(null)}
              >
                再想想
              </button>
              <button
                className="button button-danger button-small"
                onClick={confirmDelete}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
