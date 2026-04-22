"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import styles from "./page.module.css";

type Provider = {
  id: string;
  label: string;
  enabled: boolean; // has OAuth credentials configured
  linked: boolean;
};

type Props = { providers: Provider[] };

export default function LinkedAccounts({ providers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const link = (id: string) => signIn(id, { callbackUrl: "/settings" });

  const unlink = async (id: string) => {
    const res = await fetch(`/api/user/linked/${id}`, { method: "DELETE" });
    if (res.ok) startTransition(() => router.refresh());
  };

  return (
    <div className={styles.linked}>
      {providers.map((p) => (
        <div key={p.id} className={styles.linkRow}>
          <div className={styles.linkText}>
            <span className={styles.linkTitle}>{p.label}</span>
            <span className={styles.linkSub}>
              {p.linked
                ? "Connected"
                : p.enabled
                ? "Not connected"
                : "Set up required — configure credentials in .env"}
            </span>
          </div>
          {p.linked ? (
            <button
              type="button"
              className={`${styles.linkBtn} ${styles.linkBtnDanger}`}
              onClick={() => unlink(p.id)}
              disabled={pending}
            >
              UNLINK
            </button>
          ) : p.enabled ? (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => link(p.id)}
            >
              CONNECT →
            </button>
          ) : (
            <button
              type="button"
              className={styles.linkBtn}
              disabled
              title={`Add ${p.id.toUpperCase()}_CLIENT_ID and ${p.id.toUpperCase()}_CLIENT_SECRET to .env.local`}
            >
              UNAVAILABLE
            </button>
          )}
        </div>
      ))}
      <p className={styles.footNote}>
        Linking a social account lets you sign in with a single click. Your
        password still works independently.
      </p>
    </div>
  );
}
