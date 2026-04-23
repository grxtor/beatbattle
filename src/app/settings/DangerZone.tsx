"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import {
  REAUTH_REQUIRED_CODE,
  SETTINGS_REDIRECT,
} from "@/lib/authConstants";
import danger from "./danger.module.css";
import styles from "./page.module.css";

type ReauthProvider = {
  id: string;
  label: string;
};

export default function DangerZone({
  hasPassword,
  username,
  reauthProviders,
}: {
  hasPassword: boolean;
  username: string;
  reauthProviders: ReauthProvider[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reauthBusy, setReauthBusy] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const canSubmit =
    confirmText === "DELETE" &&
    (!hasPassword || password.length > 0) &&
    !busy &&
    reauthBusy === null;

  const reauthLoginHref = `/login?callbackUrl=${encodeURIComponent(
    SETTINGS_REDIRECT,
  )}`;

  const startProviderReauth = async (providerId: string) => {
    setReauthBusy(providerId);
    try {
      await signIn(providerId, { redirectTo: SETTINGS_REDIRECT });
    } finally {
      setReauthBusy(null);
    }
  };

  const doDelete = async () => {
    if (!canSubmit) return;

    setNeedsReauth(false);
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
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        if (res.status === 403 && data.code === REAUTH_REQUIRED_CODE) {
          setNeedsReauth(true);
          toast.error("Reauthenticate before deleting your account.");
        } else {
          toast.error(data.error ?? "couldn't delete account");
        }
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
          DELETE...
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => !busy && reauthBusy === null && setOpen(false)}
        title="CONFIRM DELETE"
      >
        <div className={danger.modalBody}>
          <p className={danger.warn}>
            This removes your account and everything tied to it. Rooms you
            currently host are transferred to another player when possible, and
            deleted otherwise.
          </p>

          {hasPassword && (
            <div className={styles.field}>
              <span className={styles.label}>YOUR PASSWORD</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy || reauthBusy !== null}
              />
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>
              TYPE <span>&quot;DELETE&quot;</span> TO CONFIRM
            </span>
            <input
              className={styles.input}
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              disabled={busy || reauthBusy !== null}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          {needsReauth && (
            <div className={danger.reauthBox}>
              <span className={styles.label}>RECENT LOGIN REQUIRED</span>
              <p className={styles.footNote}>
                Log in again before deleting this account.
              </p>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => router.push(reauthLoginHref)}
                  disabled={busy || reauthBusy !== null}
                >
                  {"LOG IN ->"}
                </button>
                {reauthProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => startProviderReauth(provider.id)}
                    disabled={busy || reauthBusy !== null}
                  >
                    {reauthBusy === provider.id
                      ? "..."
                      : `USE ${provider.label}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={danger.actions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setOpen(false)}
              disabled={busy || reauthBusy !== null}
            >
              CANCEL
            </button>
            <button
              type="button"
              className={danger.confirmBtn}
              onClick={doDelete}
              disabled={!canSubmit}
            >
              {busy ? "DELETING..." : "DELETE MY ACCOUNT"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
