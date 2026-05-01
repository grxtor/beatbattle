"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import styles from "./page.module.css";

type Phase =
  | "LOBBY"
  | "REVEAL"
  | "PRODUCTION"
  | "UPLOAD"
  | "VOTING"
  | "RESULTS"
  | "CANCELLED";

type Player = {
  id: string;
  userId: string;
  isHost: boolean;
  user: { id: string; username: string; initials: string };
};

type Props = {
  code: string;
  phase: Phase;
  extendedSec: number;
  players: Player[];
  onAfterAction: () => Promise<void> | void;
};

const EXTEND_STEP_SEC = 120;
const EXTEND_CAP_SEC = 600;

export default function HostControls({
  code,
  phase,
  extendedSec,
  players,
  onAfterAction,
}: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const phaseSkippable =
    phase !== "LOBBY" && phase !== "RESULTS" && phase !== "CANCELLED";
  const phaseExtendable =
    phase !== "LOBBY" &&
    phase !== "RESULTS" &&
    phase !== "CANCELLED" &&
    extendedSec + EXTEND_STEP_SEC <= EXTEND_CAP_SEC;
  const remaining = Math.max(0, EXTEND_CAP_SEC - extendedSec);
  // Don't show kick UI when removing players would corrupt vote tallies
  // (VOTING) or settled placements (RESULTS).
  const allowKick = phase !== "VOTING" && phase !== "RESULTS";
  const otherPlayers = players.filter((p) => !p.isHost);

  const post = async (path: string, label: string, body?: object) => {
    setBusy(label);
    try {
      const res = await fetch(`/api/rooms/${code}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? `${label} failed`);
        return;
      }
      toast.success(`${label} ok`);
      await onAfterAction();
    } catch {
      toast.error("network error");
    } finally {
      setBusy(null);
    }
  };

  const kick = async (userId: string, username: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Kick @${username}? They'll be removed from the room.`,
      );
      if (!ok) return;
    }
    await post("/kick", `kick @${username}`, { userId });
  };

  return (
    <div className={styles.hostControls}>
      <button
        type="button"
        className={`${styles.hostToggle} ${open ? styles.hostToggleOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>HOST TOOLS</span>
        <span className={styles.hostCaret}>{open ? "▾" : "▸"}</span>
      </button>
      <div
        className={`${styles.hostDrawer} ${open ? styles.hostDrawerOpen : ""}`}
        aria-hidden={!open}
      >
        <div className={styles.hostRow}>
          <button
            type="button"
            className={styles.hostBtn}
            disabled={!phaseSkippable || busy !== null}
            onClick={() => post("/skip-phase", "skip phase")}
            title={
              phaseSkippable
                ? "End the current phase immediately"
                : "Phase cannot be skipped"
            }
          >
            {busy === "skip phase" ? "…" : "SKIP PHASE"}
          </button>
          <button
            type="button"
            className={styles.hostBtn}
            disabled={!phaseExtendable || busy !== null}
            onClick={() => post("/extend", "extend +2:00")}
            title={
              phaseExtendable
                ? `+${EXTEND_STEP_SEC}s · ${remaining}s left`
                : "Extend cap reached"
            }
          >
            {busy === "extend +2:00"
              ? "…"
              : `EXTEND +2:00 · ${remaining}s LEFT`}
          </button>
        </div>

        {allowKick && otherPlayers.length > 0 && (
          <div className={styles.hostKickList}>
            <span className={styles.hostKickTitle}>KICK PLAYER</span>
            <div className={styles.hostKickGrid}>
              {otherPlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.hostKickBtn}
                  disabled={busy !== null}
                  onClick={() => kick(p.userId, p.user.username)}
                >
                  <span className={styles.hostKickAv}>{p.user.initials}</span>
                  <span className={styles.hostKickName}>@{p.user.username}</span>
                  <span className={styles.hostKickX}>KICK</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!allowKick && (
          <div className={styles.hostKickList}>
            <span className={styles.hostKickTitle}>
              KICK DISABLED · {phase}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
