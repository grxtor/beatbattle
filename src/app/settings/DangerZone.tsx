"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import styles from "./page.module.css";
import danger from "./danger.module.css";

export default function DangerZone({
  hasPassword,
  username,
}: {
  hasPassword: boolean;
  username: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit =
    confirmText === "DELETE" && (!hasPassword || password.length > 0) && !busy;

  const doDelete = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: confirmText,
          ...(hasPassword ? { password } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "couldn't delete account");
        setBusy(false);
        return;
      }
      toast.success("Account deleted");
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("network error");
      setBusy(false);
    }
  };

  return (
    <>
      <div className={danger.wrap}>
        <div className={danger.copy}>
          <span className={danger.title}>DELETE ACCOUNT</span>
          <span className={danger.desc}>
            Permanently remove <b>@{username}</b> and all tracks, votes, rooms
            you host, friends, and notifications. Cannot be undone.
          </span>
        </div>
        <button
          type="button"
          className={danger.btn}
          onClick={() => setOpen(true)}
        >
          DELETE…
        </button>
      </div>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="CONFIRM DELETE">
        <div className={danger.modalBody}>
          <p className={danger.warn}>
            This removes your account and everything tied to it. Rooms you
            currently host are transferred to another player when possible,
            and deleted otherwise.
          </p>
          {hasPassword && (
            <div className={styles.field}>
              <span className={styles.label}>YOUR PASSWORD</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.label}>TYPE “DELETE” TO CONFIRM</span>
            <input
              className={styles.input}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={busy}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
          <div className={danger.actions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              CANCEL
            </button>
            <button
              type="button"
              className={danger.confirmBtn}
              onClick={doDelete}
              disabled={!canSubmit}
            >
              {busy ? "DELETING…" : "DELETE MY ACCOUNT"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
