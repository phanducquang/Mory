"use client";

import { useEffect, useId, useRef, type ReactNode, type KeyboardEventHandler } from "react";
import { X } from "lucide-react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  overlayClassName?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  returnFocus?: () => HTMLElement | null;
};

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
  className = "",
  overlayClassName = "",
  onKeyDown,
  returnFocus,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);

  useEffect(() => {
    closeRef.current = onClose;
    returnFocusRef.current = returnFocus;
  }, [onClose, returnFocus]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableElements = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
          [],
      ).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          element.getAttribute("aria-hidden") !== "true",
      );

    const firstField = panelRef.current?.querySelector<HTMLElement>(
      "[data-autofocus], input:not([type=hidden]), select, textarea",
    );
    (firstField ?? focusableElements()[0] ?? panelRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }

      if (event.key === "Tab") {
        const elements = focusableElements();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          panelRef.current?.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !panelRef.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !panelRef.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef.current?.();
      if (target?.isConnected) target.focus({ preventScroll: true });
      else if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`modal-overlay ${overlayClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`modal-panel${wide ? " modal-wide" : ""} ${className}`}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Đóng hộp thoại"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
