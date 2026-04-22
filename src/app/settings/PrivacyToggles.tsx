"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useUnsavedRegistration } from "@/components/UnsavedChanges";
import styles from "./page.module.css";

type Props = {
  acceptFriendRequests: boolean;
  showOnLeaderboard: boolean;
  discoverable: boolean;
};

type Key = "acceptFriendRequests" | "showOnLeaderboard" | "discoverable";

const ROWS: { key: Key; title: string; desc: string }[] = [
  {
    key: "acceptFriendRequests",
    title: "ACCEPT FRIEND REQUESTS",
    desc: "When off, nobody can send you new friend requests.",
  },
  {
    key: "showOnLeaderboard",
    title: "SHOW ON LEADERBOARD",
    desc: "When off, your name is hidden from Global and Weekly rankings.",
  },
  {
    key: "discoverable",
    title: "DISCOVERABLE",
    desc: "When off, you won't appear in friend suggestions.",
  },
];

export default function PrivacyToggles(props: Props) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(props);

  const dirty =
    state.acceptFriendRequests !== props.acceptFriendRequests ||
    state.showOnLeaderboard !== props.showOnLeaderboard ||
    state.discoverable !== props.discoverable;

  const save = useCallback(async () => {
    const diff: Partial<Props> = {};
    if (state.acceptFriendRequests !== props.acceptFriendRequests)
      diff.acceptFriendRequests = state.acceptFriendRequests;
    if (state.showOnLeaderboard !== props.showOnLeaderboard)
      diff.showOnLeaderboard = state.showOnLeaderboard;
    if (state.discoverable !== props.discoverable)
      diff.discoverable = state.discoverable;
    if (Object.keys(diff).length === 0) return;

    try {
      const res = await fetch("/api/user/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diff),
      });
      if (!res.ok) {
        toast.error("Couldn't save privacy");
        throw new Error("save failed");
      }
      toast.success("Privacy saved");
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "save failed") throw err;
      toast.error("connection error");
      throw err;
    }
  }, [state, props, toast, router]);

  const reset = useCallback(() => setState(props), [props]);

  useUnsavedRegistration({
    id: "settings.privacy",
    dirty,
    save,
    reset,
  });

  const toggle = (key: Key) => {
    setState((s) => ({ ...s, [key]: !s[key] }));
  };

  return (
    <div className={styles.toggles}>
      {ROWS.map((row) => {
        const on = state[row.key];
        return (
          <div key={row.key} className={styles.toggleRow}>
            <div className={styles.toggleText}>
              <span className={styles.toggleTitle}>{row.title}</span>
              <span className={styles.toggleDesc}>{row.desc}</span>
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${on ? styles.toggleOn : ""}`}
              role="switch"
              aria-checked={on}
              onClick={() => toggle(row.key)}
            >
              <span className={styles.toggleKnob} />
              <span className={styles.toggleLabel}>{on ? "ON" : "OFF"}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
