"use client";

import { useEffect } from "react";
import Link from "next/link";
import Sketch from "./Sketch";
import styles from "./ErrorShell.module.css";

export type ErrorShellProps = {
  error: Error & { digest?: string };
  retry: () => void;
  label?: string;
  variant?: 1 | 2 | 3;
  message?: string;
};

export default function ErrorShell({
  error,
  retry,
  label = "SOMETHING BROKE",
  variant = 1,
  message,
}: ErrorShellProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const detail = message ?? "This segment hit an unexpected error. You can try again or head back.";

  return (
    <main className={styles.page}>
      <Sketch variant={variant} className={styles.shell}>
        <div className={styles.body}>
          <span className={styles.label}>{label}</span>
          <p className={styles.message}>{detail}</p>
          {error.digest ? (
            <span className={styles.digest}>ref: {error.digest}</span>
          ) : null}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => retry()}>
              TRY AGAIN
            </button>
            <Link className={styles.secondary} href="/">
              GO HOME
            </Link>
          </div>
        </div>
      </Sketch>
    </main>
  );
}
