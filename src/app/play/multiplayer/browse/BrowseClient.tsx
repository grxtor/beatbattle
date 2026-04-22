"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sketch from "@/components/Sketch";
import EmptyState from "@/components/EmptyState";
import type { Room } from "@/components/RoomsPanel";
import styles from "./page.module.css";

const POLL_MS = 8_000;

const GENRES = ["ALL", "TRAP", "LO-FI", "HIP-HOP", "HOUSE", "FX", "RANDOM"] as const;
type GenreFilter = (typeof GENRES)[number];
const STATUSES = ["ALL", "OPEN", "FULL"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default function BrowseClient({ initialRooms }: { initialRooms: Room[] }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genre, setGenre] = useState<GenreFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/rooms?limit=30", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rooms: Room[] };
      if (mounted.current) {
        setRooms(data.rooms ?? []);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "fetch failed");
      }
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (genre !== "ALL" && r.genre !== genre) return false;
      if (status === "OPEN" && r.players >= r.max) return false;
      if (status === "FULL" && r.players < r.max) return false;
      return true;
    });
  }, [rooms, genre, status]);

  return (
    <div className={styles.browseWrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>GENRE</span>
          <div className={styles.chips}>
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className={`${styles.chip} ${genre === g ? styles.chipOn : ""}`}
                onClick={() => setGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>STATUS</span>
          <div className={styles.chips}>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.chip} ${status === s ? styles.chipOn : ""}`}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.toolbarEnd}>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? "…" : "REFRESH"}
          </button>
          <span className={styles.count}>
            {filtered.length} / {rooms.length} LIVE
          </span>
        </div>
      </div>

      {error ? <div className={styles.error}>LIVE UPDATE FAILED — {error}</div> : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon="#"
          label={rooms.length === 0 ? "NO LIVE ROOMS" : "NO MATCHES"}
          hint={
            rooms.length === 0
              ? "Be the first — host one and share the code."
              : "Loosen the filters or create your own."
          }
          cta={{ label: "+ CREATE ROOM", href: "/play/multiplayer/create" }}
        />
      ) : (
        <div className={styles.grid}>
          {filtered.map((r) => (
            <RoomCard
              key={r.code}
              room={r}
              onJoin={() => router.push(`/play/room/${r.code}`)}
            />
          ))}
        </div>
      )}

      <div className={styles.footCta}>
        <Link href="/play/multiplayer/join" className={styles.footLink}>
          HAVE A CODE? →
        </Link>
        <Link href="/play/multiplayer/create" className={styles.footLink}>
          OR CREATE YOUR OWN →
        </Link>
      </div>
    </div>
  );
}

function RoomCard({ room: r, onJoin }: { room: Room; onJoin: () => void }) {
  const full = r.players >= r.max;
  return (
    <Sketch
      variant={2}
      className={`${styles.card} ${full ? styles.cardFull : ""}`}
    >
      <div className={styles.cardTop}>
        <span className={styles.code}>{r.code}</span>
        {r.featured ? <span className={styles.star}>★</span> : null}
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
              i < r.players ? (full ? styles.full : styles.on) : styles.off
            }
          />
        ))}
      </div>
      <div className={styles.cardFoot}>
        <span>
          <b>
            {r.players}/{r.max}
          </b>{" "}
          · <b>{r.timeLeft}</b>
        </span>
        <button
          type="button"
          className={styles.joinBtn}
          onClick={onJoin}
          disabled={full}
        >
          {full ? "FULL" : "JOIN"}
        </button>
      </div>
    </Sketch>
  );
}
