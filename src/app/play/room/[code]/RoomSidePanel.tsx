"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import styles from "./roomSidePanel.module.css";

type Phase =
  | "LOBBY"
  | "REVEAL"
  | "PRODUCTION"
  | "UPLOAD"
  | "VOTING"
  | "RESULTS"
  | "CANCELLED";

export type PanelPlayer = {
  id: string;
  userId: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  lastSeenSecondsAgo: number;
  hasSubmitted: boolean;
  votesCast: number;
  votesTotal: number;
  user: { id: string; username: string; initials: string; level: number };
};

export type PanelResult = {
  place: number;
  user: { id: string };
};

type Props = {
  code: string;
  phase: Phase;
  players: PanelPlayer[];
  results: PanelResult[];
  meId: string;
  isHost: boolean;
  extendedSec: number;
  onAfterAction: () => Promise<void> | void;
};

const EXTEND_STEP_SEC = 120;
const EXTEND_CAP_SEC = 600;

function fmtAfk(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

type Badge = {
  label: string;
  tone: "ok" | "warn" | "muted" | "accent";
};

function statusFor(phase: Phase, p: PanelPlayer, results: PanelResult[]): Badge {
  switch (phase) {
    case "LOBBY":
      return p.isHost
        ? { label: "HOST", tone: "accent" }
        : p.isReady
        ? { label: "READY", tone: "ok" }
        : { label: "WAITING", tone: "warn" };
    case "REVEAL":
      return { label: "LISTENING", tone: "muted" };
    case "PRODUCTION":
    case "UPLOAD":
      return p.hasSubmitted
        ? { label: "✓ SUBMITTED", tone: "ok" }
        : {
            label: phase === "UPLOAD" ? "UPLOADING…" : "PRODUCING",
            tone: "warn",
          };
    case "VOTING": {
      if (p.votesTotal <= 0) {
        return { label: "SPECTATING", tone: "muted" };
      }
      const done = p.votesCast >= p.votesTotal;
      return done
        ? { label: "✓ DONE", tone: "ok" }
        : { label: `VOTED ${p.votesCast}/${p.votesTotal}`, tone: "warn" };
    }
    case "RESULTS": {
      const r = results.find((x) => x.user.id === p.userId);
      if (!r) return { label: "—", tone: "muted" };
      return { label: `#${r.place}`, tone: r.place === 1 ? "accent" : "muted" };
    }
    case "CANCELLED":
    default:
      return { label: "—", tone: "muted" };
  }
}

export default function RoomSidePanel({
  code,
  phase,
  players,
  results,
  meId,
  isHost,
  extendedSec,
  onAfterAction,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (phase === "CANCELLED" || players.length === 0) return null;

  const phaseSkippable: boolean =
    phase !== "LOBBY" && phase !== "RESULTS";
  const phaseExtendable =
    phaseSkippable && extendedSec + EXTEND_STEP_SEC <= EXTEND_CAP_SEC;
  const remaining = Math.max(0, EXTEND_CAP_SEC - extendedSec);
  // Don't show kick UI when removing players would corrupt vote tallies
  // (VOTING) or settled placements (RESULTS).
  const allowKick = phase !== "VOTING" && phase !== "RESULTS";

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
    <aside className={styles.panel} aria-label="Players">
      <div className={styles.head}>
        <span className={styles.title}>PLAYERS</span>
        <span className={styles.count}>{players.length}</span>
      </div>

      <ul className={styles.list}>
        {players.map((p) => {
          const badge = statusFor(phase, p, results);
          const isMe = p.userId === meId;
          const tooltip = p.isOnline
            ? `Online · LVL ${p.user.level}`
            : `AFK ${fmtAfk(p.lastSeenSecondsAgo)} · LVL ${p.user.level}`;
          // Host can kick anyone except themselves and the host (which is
          // themselves). The endpoint also rejects self/host kick — UI just
          // hides the button to keep it tidy.
          const kickable = isHost && allowKick && !p.isHost && !isMe;
          return (
            <li
              key={p.id}
              className={`${styles.row} ${isMe ? styles.rowMe : ""} ${
                p.isHost ? styles.rowHost : ""
              }`}
              title={tooltip}
            >
              <div className={styles.avBox}>
                <div className={styles.av}>{p.user.initials}</div>
                <span
                  className={`${styles.dot} ${
                    p.isOnline ? styles.dotOn : styles.dotOff
                  }`}
                  aria-label={p.isOnline ? "online" : "offline"}
                />
              </div>
              <div className={styles.body}>
                <span className={styles.name}>
                  @{p.user.username}
                  {isMe && <span className={styles.youTag}> (YOU)</span>}
                </span>
                <span className={styles.meta}>
                  LVL {p.user.level}
                  {p.isHost && <b className={styles.hostTag}> · HOST</b>}
                  {!p.isOnline && (
                    <span className={styles.afkTag}>
                      {" "}· AFK {fmtAfk(p.lastSeenSecondsAgo)}
                    </span>
                  )}
                </span>
                <span
                  className={`${styles.badge} ${
                    badge.tone === "ok"
                      ? styles.tonOk
                      : badge.tone === "warn"
                      ? styles.tonWarn
                      : badge.tone === "accent"
                      ? styles.tonAccent
                      : styles.tonMuted
                  }`}
                >
                  {badge.label}
                </span>
              </div>
              {kickable && (
                <button
                  type="button"
                  className={styles.kickBtn}
                  disabled={busy !== null}
                  onClick={() => kick(p.userId, p.user.username)}
                  title={`Kick @${p.user.username}`}
                >
                  KICK
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isHost && phaseSkippable && (
        <div className={styles.hostFoot}>
          <span className={styles.hostFootTitle}>HOST TOOLS</span>
          <button
            type="button"
            className={styles.hostBtn}
            disabled={busy !== null}
            onClick={() => post("/skip-phase", "skip phase")}
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
      )}
    </aside>
  );
}
