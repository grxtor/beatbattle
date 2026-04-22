"use client";

import { useRouter } from "next/navigation";
import Sketch from "./Sketch";
import EmptyState from "./EmptyState";
import styles from "./RoomsPanel.module.css";

export type Room = {
  code: string;
  name: string;
  host: string;
  hostLvl: number;
  genre: string;
  length: string;
  players: number;
  max: number;
  timeLeft: string;
  featured?: boolean;
};

export type RoomsPanelProps = {
  rooms: Room[];
  liveCount?: number;
  className?: string;
  onJoin?: (code: string) => void;
};

export default function RoomsPanel({
  rooms,
  liveCount,
  className = "",
  onJoin,
}: RoomsPanelProps) {
  const router = useRouter();
  const join = onJoin ?? ((code: string) => router.push(`/play/room/${code}`));

  return (
    <Sketch
      as="aside"
      variant={2}
      className={`${styles.panel} ${className}`}
    >
      <div className={styles.head}>
        <span className={styles.title}>PUBLIC ROOMS</span>
        <span className={styles.meta}>{liveCount ?? rooms.length} LIVE</span>
      </div>

      <div className={styles.body}>
        {rooms.length === 0 ? (
          <EmptyState
            compact
            icon="#"
            label="NO LIVE ROOMS"
            hint="Be the first — host one and share the code."
            cta={{ label: "+ CREATE ROOM", href: "/play/multiplayer/create" }}
          />
        ) : (
          rooms.map((r) => <RoomRow key={r.code} r={r} onJoin={join} />)
        )}
      </div>
    </Sketch>
  );
}

function RoomRow({
  r,
  onJoin,
}: {
  r: Room;
  onJoin?: (code: string) => void;
}) {
  const full = r.players === r.max;
  return (
    <div
      className={styles.room}
      onClick={() => !full && onJoin?.(r.code)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !full) onJoin?.(r.code);
      }}
      style={{ cursor: full ? "not-allowed" : "pointer" }}
    >
      <div className={styles.top}>
        <span className={styles.code}>{r.code}</span>
        {r.featured && <span className={styles.star}>*</span>}
        <span className={styles.name}>{r.name}</span>
      </div>
      <span className={styles.host}>
        Host <b>@{r.host}</b> · LVL {r.hostLvl}
      </span>
      <div className={styles.tags}>
        <span className={`${styles.tag} ${styles.tagGenre}`}>{r.genre}</span>
        <span className={styles.tag}>{r.length}</span>
        <span className={styles.tag}>{full ? "FULL" : "OPEN"}</span>
      </div>
      <div className={styles.playerBar}>
        {Array.from({ length: r.max }, (_, i) => (
          <span
            key={i}
            className={
              i < r.players ? (full ? styles.full : styles.on) : ""
            }
          />
        ))}
      </div>
      <div className={styles.foot}>
        <div>
          <b>
            {r.players}/{r.max}
          </b>{" "}
          PLAYERS · <b>{r.timeLeft}</b>
        </div>
        <Sketch
          as="button"
          variant={3}
          className={styles.joinBtn}
          onClick={() => onJoin?.(r.code)}
        >
          JOIN
        </Sketch>
      </div>
    </div>
  );
}
