"use client";

import styles from "./page.module.css";

type Phase =
  | "LOBBY"
  | "REVEAL"
  | "PRODUCTION"
  | "UPLOAD"
  | "VOTING"
  | "RESULTS"
  | "CANCELLED";

export type StripPlayer = {
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

export type StripResult = {
  place: number;
  user: { id: string };
};

type Props = {
  phase: Phase;
  players: StripPlayer[];
  results: StripResult[];
  meId: string;
};

function fmtAfk(sec: number): string {
  if (sec < 60) return `AFK ${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `AFK ${m}m`;
  const h = Math.floor(m / 60);
  return `AFK ${h}h`;
}

type Badge = {
  label: string;
  /** 'ok' | 'warn' | 'muted' | 'accent' — drives color */
  tone: "ok" | "warn" | "muted" | "accent";
};

function statusFor(phase: Phase, p: StripPlayer, results: StripResult[]): Badge {
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

export default function PlayerStatusStrip({
  phase,
  players,
  results,
  meId,
}: Props) {
  if (phase === "CANCELLED" || players.length === 0) return null;
  return (
    <div className={styles.playerStatusStrip} aria-label="Players">
      {players.map((p) => {
        const badge = statusFor(phase, p, results);
        const isMe = p.userId === meId;
        const tooltip = p.isOnline
          ? `Online · LVL ${p.user.level}`
          : fmtAfk(p.lastSeenSecondsAgo);
        return (
          <div
            key={p.id}
            className={`${styles.psTile} ${isMe ? styles.psMe : ""} ${
              p.isHost ? styles.psHost : ""
            }`}
            title={tooltip}
          >
            <div className={styles.psAvatarBox}>
              <div className={styles.psAvatar}>{p.user.initials}</div>
              <span
                className={`${styles.psDot} ${
                  p.isOnline ? styles.dotOn : styles.dotOff
                }`}
                aria-label={p.isOnline ? "online" : "offline"}
              />
            </div>
            <div className={styles.psBody}>
              <span className={styles.psName}>
                @{p.user.username}
                {p.isHost && <b className={styles.psHostTag}> HOST</b>}
              </span>
              <span className={styles.psMeta}>LVL {p.user.level}</span>
              <span
                className={`${styles.psBadge} ${
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
          </div>
        );
      })}
    </div>
  );
}
