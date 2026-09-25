import { useCallback, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";
import styles from "./ui.module.css";

export interface EditorDrawerProps {
  children: ReactNode;
  hasUnsavedChanges?: boolean;
  footer: ReactNode | ((requestClose: () => void) => ReactNode);
  onClose: () => void;
  open: boolean;
  title: string;
}

export function EditorDrawer({
  children,
  footer,
  hasUnsavedChanges = false,
  onClose,
  open,
  title
}: EditorDrawerProps) {
  const titleId = useId();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const finishClose = useCallback(() => {
    setConfirmingClose(false);
    onClose();
  }, [onClose]);
  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setConfirmingClose(true);
      return;
    }
    finishClose();
  }, [finishClose, hasUnsavedChanges]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, requestClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.editorDrawerBackdrop} onMouseDown={requestClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.editorDrawer}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className={styles.editorDrawerHeader}>
          <h2 id={titleId}>{title}</h2>
          <Button aria-label="بستن ویرایشگر" onClick={requestClose} size="sm" variant="ghost">
            <X aria-hidden="true" size={20} />
          </Button>
        </header>
        <div className={styles.editorDrawerBody}>{children}</div>
        <footer className={styles.editorDrawerFooter}>
          {confirmingClose ? (
            <div className={styles.editorDrawerConfirm} role="alertdialog">
              <strong>تغییرات ذخیره نشده‌اند.</strong>
              <span>از ویرایش خارج می‌شوید و تغییرات کنار گذاشته می‌شوند؟</span>
              <div>
                <Button onClick={() => setConfirmingClose(false)} variant="secondary">
                  ادامه ویرایش
                </Button>
                <Button onClick={finishClose} variant="danger">
                  خروج بدون ذخیره
                </Button>
              </div>
            </div>
          ) : typeof footer === "function" ? (
            footer(requestClose)
          ) : (
            footer
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}
