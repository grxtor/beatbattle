"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import Sketch from "@/components/Sketch";
import { useToast } from "@/components/Toast";
import styles from "./page.module.css";

type Provider = { id: "discord" | "google"; label: string; mark: string };

type Props = {
  providers: Provider[];
  mode: "login" | "signup";
};

function FormInner({ providers, mode }: Props) {
  const router = useRouter();
  const toast = useToast();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);

  const isSignup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignup) {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim().toLowerCase(),
            password,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error ?? "signup failed");
          return;
        }
      }
      const login = await signIn("credentials", {
        username: username.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!login?.ok) {
        setError(isSignup ? "signed up but couldn't log in" : "invalid username or password");
        if (isSignup) router.replace("/login");
        return;
      }
      toast.success(isSignup ? "Welcome producer 🎧" : "Welcome back");
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("connection error");
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (id: string) => {
    setOauthBusy(id);
    try {
      await signIn(id, { callbackUrl });
    } finally {
      setOauthBusy(null);
    }
  };

  const enabledProviders = providers;

  return (
    <main className={styles.page}>
      <Sketch variant={1} className={styles.card}>
        <h1 className={styles.title}>
          {isSignup ? (
            <>SIGN <span>UP</span></>
          ) : (
            <>LOG <span>IN</span></>
          )}
        </h1>
        <p className={styles.sub}>
          {isSignup
            ? "pick your producer name, start battling."
            : "log in with your producer id."}
        </p>

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.label}>USERNAME</span>
            <input
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@producer"
              autoComplete="username"
              autoFocus
              required
              minLength={isSignup ? 3 : 2}
              maxLength={20}
              pattern={isSignup ? "[a-zA-Z0-9_]+" : undefined}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>PASSWORD</span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={6}
            />
          </label>

          {error && <span className={styles.error}>{error}</span>}

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? "..." : isSignup ? "CREATE →" : "LOG IN →"}
          </button>
        </form>

        {enabledProviders.length > 0 && (
          <>
            <div className={styles.divider}>
              <span>OR CONTINUE WITH</span>
            </div>
            <div className={styles.oauthList}>
              {enabledProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.oauthBtn}
                  onClick={() => oauth(p.id)}
                  disabled={oauthBusy !== null}
                >
                  <span className={styles.oauthMark} aria-hidden="true">
                    {p.mark}
                  </span>
                  {oauthBusy === p.id ? "..." : p.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className={styles.altRow}>
          {isSignup ? (
            <>
              <span>have an account?</span>
              <Link href="/login" className={styles.altLink}>
                LOG IN →
              </Link>
            </>
          ) : (
            <>
              <span>new here?</span>
              <Link href="/signup" className={styles.altLink}>
                CREATE ACCOUNT →
              </Link>
            </>
          )}
        </div>
      </Sketch>
    </main>
  );
}

export default function LoginForm(props: Props) {
  return (
    <Suspense fallback={null}>
      <FormInner {...props} />
    </Suspense>
  );
}
