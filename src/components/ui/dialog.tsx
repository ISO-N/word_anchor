"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./dialog.module.css";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** 打开时优先聚焦的元素；默认聚焦面板内第一个可聚焦元素 */
  initialFocus?: React.RefObject<HTMLElement | null>;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** 打开对话框时被 inert 隔离的区域，避免 Tab 跑到后面的页面上 */
const BACKGROUND_TARGETS = ["#site-header", "#main-content", "#site-footer"];

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocus,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  /* 保持回调最新，但不让它成为 effect 依赖：否则每次父组件重渲染
     都会拆装一次监听并重新抢焦点 */
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    restoreRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const background = BACKGROUND_TARGETS.map((selector) =>
      document.querySelector<HTMLElement>(selector),
    ).filter((element): element is HTMLElement => element !== null);
    background.forEach((element) => {
      element.inert = true;
    });

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => {
        if (element.hasAttribute("hidden") || element.closest("[hidden]")) {
          return false;
        }
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });

    const target = initialFocus?.current ?? focusables()[0] ?? panel;
    target?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!panel?.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      background.forEach((element) => {
        element.inert = false;
      });
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      const restore = restoreRef.current;
      if (restore && restore !== document.body) {
        restore.focus();
      } else {
        document
          .querySelector<HTMLElement>("#main-content")
          ?.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocus]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {description && (
          <p className={styles.description} id={descriptionId}>
            {description}
          </p>
        )}
        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
