"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Sketch from "./Sketch";
import styles from "./Toast.module.css";

export type ToastTier = "info" | "success" | "error";

type ToastInput = {
  tier?: ToastTier;
  title?: string;
  message: string;
  /** Auto-dismiss in ms. Default 3000. Pass 0 to keep until manual close. */
  duration?: number;
};

type ToastEntry = ToastInput & { id: number; tier: ToastTier; exiting?: boolean };

type ToastContextValue = {
  toast: (t: ToastInput) => number;
  success: (message: string, title?: string) => number;
  error: (message: string, title?: string) => number;
  info: (message: string, title?: string) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTier, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

const VARIANTS: Record<ToastTier, 1 | 2 | 3> = {
  info: 1,
  success: 2,
  error: 3,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setItems((curr) =>
      curr.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setItems((curr) => curr.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current;
      const entry: ToastEntry = { ...t, id, tier: t.tier ?? "info" };
      setItems((curr) => [...curr, entry]);
      const duration = t.duration ?? 3000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    toast,
    success: (message, title) => toast({ tier: "success", message, title }),
    error: (message, title) => toast({ tier: "error", message, title }),
    info: (message, title) => toast({ tier: "info", message, title }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div className={styles.viewport} aria-live="polite" aria-atomic="false">
            {items.map((t) => (
              <Sketch
                key={t.id}
                variant={VARIANTS[t.tier]}
                className={`${styles.toast} ${styles[t.tier]} ${
                  t.exiting ? styles.exiting : ""
                }`}
              >
                <span className={styles.icon} aria-hidden="true">
                  {ICONS[t.tier]}
                </span>
                <div className={styles.body}>
                  {t.title && <span className={styles.title}>{t.title}</span>}
                  <span className={styles.msg}>{t.message}</span>
                </div>
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </Sketch>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
