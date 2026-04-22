"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";
import { useToast } from "./Toast";
import styles from "./AddFriendModal.module.css";

type Suggestion = {
  username: string;
  initials: string;
  level: number;
};

export type AddFriendModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function AddFriendModal({ open, onClose }: AddFriendModalProps) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, "ok" | "err">>({});
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/signup` : "/signup";

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/friends/suggestions", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadSuggestions();
      setQuery("");
      setSent({});
      setSearchMsg(null);
    }
  }, [open, loadSuggestions]);

  const request = async (username: string) => {
    setSending(username);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        setSent((s) => ({ ...s, [username]: "ok" }));
        toast.success(`Friend request sent to @${username}`);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSent((s) => ({ ...s, [username]: "err" }));
        const msg = data.error ?? "couldn't send request";
        setSearchMsg(msg);
        toast.error(msg);
      }
    } finally {
      setSending(null);
    }
  };

  const findByUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = query.trim().toLowerCase();
    if (!name) return;
    setSearchMsg(null);
    await request(name);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="ADD FRIEND">
      <div className={styles.stack}>
        <form className={styles.section} onSubmit={findByUsername}>
          <span className={styles.label}>SEARCH BY USERNAME</span>
          <div className={styles.searchBox}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="@producer..."
            />
            <button className={styles.searchBtn} type="submit">
              FIND
            </button>
          </div>
          <span className={styles.hint}>
            {searchMsg ?? "Type a username and hit FIND to send a friend request."}
          </span>
        </form>

        <div className={styles.section}>
          <span className={styles.label}>SUGGESTED</span>
          <div className={styles.suggestions}>
            {suggestions.length === 0 && (
              <span className={styles.hint}>no suggestions right now.</span>
            )}
            {suggestions.map((s) => {
              const state = sent[s.username];
              return (
                <div key={s.username} className={styles.row}>
                  <div className={styles.avatar}>{s.initials}</div>
                  <div className={styles.rowBody}>
                    <span className={styles.rowName}>@{s.username}</span>
                    <span className={styles.rowSub}>LVL {s.level}</span>
                  </div>
                  <button
                    className={`${styles.addBtn} ${
                      state === "ok" ? styles.added : ""
                    }`}
                    onClick={() => request(s.username)}
                    disabled={sending === s.username || state === "ok"}
                  >
                    {state === "ok"
                      ? "✓ SENT"
                      : state === "err"
                      ? "× FAIL"
                      : sending === s.username
                      ? "..."
                      : "+ ADD"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.divider}>
          <span>OR SHARE INVITE LINK</span>
        </div>

        <div className={styles.section}>
          <div className={styles.inviteBox}>
            <input readOnly value={inviteUrl} />
            <button
              className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
              onClick={copy}
            >
              {copied ? "✓ COPIED" : "COPY"}
            </button>
          </div>
          <span className={styles.hint}>
            Send this link — whoever opens it will be auto-added after signup.
          </span>
        </div>
      </div>
    </Modal>
  );
}
