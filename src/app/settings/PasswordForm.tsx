"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import styles from "./page.module.css";

export default function PasswordForm({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return (
      <p className={styles.footNote}>
        This account signed in via OAuth and has no local password to change.
      </p>
    );
  }

  const canSubmit =
    current.length >= 1 && next.length >= 6 && confirm === next && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "couldn't change password");
        return;
      }
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
      router.refresh();
    } catch {
      toast.error("network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <span className={styles.label}>CURRENT PASSWORD</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>NEW PASSWORD</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={6}
        />
        <span className={styles.hint}>At least 6 characters.</span>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>CONFIRM NEW PASSWORD</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm.length > 0 && confirm !== next ? (
          <span className={styles.hint} style={{ color: "#d85050" }}>
            Passwords don&apos;t match.
          </span>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {busy ? "SAVING…" : "CHANGE PASSWORD"}
        </button>
      </div>
    </form>
  );
}
