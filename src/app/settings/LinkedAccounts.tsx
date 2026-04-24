"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/Toast";
import {
  REAUTH_REQUIRED_CODE,
  SETTINGS_REDIRECT,
} from "@/lib/authConstants";
import styles from "./page.module.css";

type Provider = {
  id: string;
  label: string;
  enabled: boolean;
  linked: boolean;
};

type Props = { providers: Provider[] };

export default function LinkedAccounts({ providers }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const reauthLoginHref = `/login?callbackUrl=${encodeURIComponent(
    SETTINGS_REDIRECT,
  )}`;
  const reauthProviders = providers.filter(
    (provider) => provider.linked && provider.enabled,
  );

  const startProviderFlow = async (id: string) => {
    setNeedsReauth(false);
    setOauthBusy(id);
    try {
      await signIn(id, { redirectTo: SETTINGS_REDIRECT });
    } finally {
      setOauthBusy(null);
    }
  };

  const unlink = async (id: string) => {
    const res = await fetch(`/api/user/linked/${id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };

    if (!res.ok) {
      if (res.status === 403 && data.code === REAUTH_REQUIRED_CODE) {
        setNeedsReauth(true);
        toast.error("Reauthenticate before unlinking an account.");
      } else {
        toast.error(data.error ?? "couldn't unlink account");
      }
      return;
    }

    setNeedsReauth(false);
    startTransition(() => router.refresh());
  };

  return (
    <div className={styles.linked}>
      {providers.map((provider) => (
        <div key={provider.id} className={styles.linkRow}>
          <div className={styles.linkText}>
            <span className={styles.linkTitle}>{provider.label}</span>
            <span className={styles.linkSub}>
              {provider.linked
                ? "Connected"
                : provider.enabled
                ? "Not connected"
                : "Set up required - configure credentials in .env"}
            </span>
          </div>
          {provider.linked ? (
            <button
              type="button"
              className={`${styles.linkBtn} ${styles.linkBtnDanger}`}
              onClick={() => unlink(provider.id)}
              disabled={pending || oauthBusy !== null}
            >
              UNLINK
            </button>
          ) : provider.enabled ? (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => startProviderFlow(provider.id)}
              disabled={pending || oauthBusy !== null}
            >
              {oauthBusy === provider.id ? "..." : "CONNECT ->"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.linkBtn}
              disabled
              title={`Add ${provider.id.toUpperCase()}_CLIENT_ID and ${provider.id.toUpperCase()}_CLIENT_SECRET to .env.local`}
            >
              UNAVAILABLE
            </button>
          )}
        </div>
      ))}

      {needsReauth && (
        <div className={styles.linkRow}>
          <div className={styles.linkText}>
            <span className={styles.linkTitle}>RECENT LOGIN REQUIRED</span>
            <span className={styles.linkSub}>
              Log in again before unlinking an account.
            </span>
          </div>
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => router.push(reauthLoginHref)}
              disabled={pending || oauthBusy !== null}
            >
              {"LOG IN ->"}
            </button>
            {reauthProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={styles.linkBtn}
                onClick={() => startProviderFlow(provider.id)}
                disabled={pending || oauthBusy !== null}
              >
                {oauthBusy === provider.id ? "..." : `USE ${provider.label}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className={styles.footNote}>
        Linking a social account lets you sign in with a single click. Your
        password still works independently.
      </p>
    </div>
  );
}
