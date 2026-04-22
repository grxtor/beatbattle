"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Sketch from "./Sketch";
import styles from "./UnsavedChanges.module.css";

type Entry = {
  id: string;
  dirty: boolean;
  save: () => Promise<unknown> | unknown;
  reset: () => void;
};

type Ctx = {
  register: (entry: Entry) => void;
  unregister: (id: string) => void;
  shake: () => void;
  anyDirty: boolean;
};

const Context = createContext<Ctx | null>(null);

export type UnsavedChangesProviderProps = {
  children: React.ReactNode;
};

export function UnsavedChangesProvider({
  children,
}: UnsavedChangesProviderProps) {
  const entriesRef = useRef<Map<string, Entry>>(new Map());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [saving, setSaving] = useState(false);

  const recompute = useCallback(() => {
    let count = 0;
    entriesRef.current.forEach((e) => {
      if (e.dirty) count++;
    });
    setDirtyCount((prev) => (prev !== count ? count : prev));
  }, []);

  const register = useCallback(
    (entry: Entry) => {
      entriesRef.current.set(entry.id, entry);
      recompute();
    },
    [recompute],
  );

  const unregister = useCallback(
    (id: string) => {
      entriesRef.current.delete(id);
      recompute();
    },
    [recompute],
  );

  const shake = useCallback(() => {
    setShaking(true);
    document.body.setAttribute("data-warn", "true");
    setTimeout(() => {
      setShaking(false);
      document.body.removeAttribute("data-warn");
    }, 450);
  }, []);

  const anyDirty = dirtyCount > 0;

  // Browser-level guard for tab close / hard nav.
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  // In-app link guard: intercept clicks on real <a> tags while dirty.
  useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      if (a.getAttribute("data-allow-leave") === "1") return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (a.target === "_blank") return;
      e.preventDefault();
      shake();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [anyDirty, shake]);

  const saveAll = async () => {
    setSaving(true);
    const dirty = Array.from(entriesRef.current.values()).filter((e) => e.dirty);
    try {
      for (const e of dirty) {
        await e.save();
      }
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    entriesRef.current.forEach((e) => {
      if (e.dirty) e.reset();
    });
  };

  const value = useMemo<Ctx>(
    () => ({ register, unregister, shake, anyDirty }),
    [register, unregister, shake, anyDirty],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {shaking && <div className={styles.flash} aria-hidden="true" />}
      {anyDirty && (
        <Sketch
          variant={2}
          className={styles.bar}
          data-shake={shaking ? "true" : undefined}
          role="status"
          aria-live="polite"
        >
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>
            <b>UNSAVED</b> · {dirtyCount} change{dirtyCount === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className={styles.reset}
            onClick={resetAll}
            disabled={saving}
          >
            RESET
          </button>
          <button
            type="button"
            className={styles.save}
            onClick={saveAll}
            disabled={saving}
          >
            {saving ? "..." : "SAVE"}
          </button>
        </Sketch>
      )}
    </Context.Provider>
  );
}

/**
 * Forms call this with their current dirty state and SAVE/RESET callbacks.
 * The id must be stable per-form-instance.
 *
 * Internally uses refs so callback identity churn doesn't re-trigger the
 * registration effect (the effect fires only when id or dirty actually flip).
 */
export function useUnsavedRegistration({ id, dirty, save, reset }: Entry) {
  const ctx = useContext(Context);

  // Stable refs to the latest values; the effect reads from these so we don't
  // need to list the unstable function identities (or the ctx object itself)
  // as dependencies — that path leads to an infinite register/unregister loop.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const saveRef = useRef(save);
  saveRef.current = save;
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    const c = ctxRef.current;
    if (!c) return;
    c.register({
      id,
      dirty,
      save: () => saveRef.current(),
      reset: () => resetRef.current(),
    });
    return () => c.unregister(id);
  }, [id, dirty]);
}

export function useUnsavedChanges() {
  const ctx = useContext(Context);
  if (!ctx)
    throw new Error(
      "useUnsavedChanges must be used inside <UnsavedChangesProvider>",
    );
  return ctx;
}
