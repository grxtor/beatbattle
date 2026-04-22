"use client";

import { useEffect } from "react";
import Sketch from "./Sketch";
import styles from "./Modal.module.css";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 1 | 2 | 3;
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  variant = 1,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460 }}>
        <Sketch variant={variant} className={styles.modal}>
          <div className={styles.head}>
            <span className={styles.title}>{title}</span>
            <button
              className={styles.close}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className={styles.body}>{children}</div>
        </Sketch>
      </div>
    </div>
  );
}
