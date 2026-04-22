"use client";

import { useEffect, useRef, useState } from "react";
import Sketch from "./Sketch";
import { logoutAction } from "@/lib/auth-actions";
import styles from "./UserCard.module.css";

export type UserCardProps = {
  username: string;
  initials: string;
  rank: string;
  level: number;
  wins: number;
  streak: number;
  xp: number;
  xpMax: number;
  online?: boolean;
};

export default function UserCard({
  username,
  initials,
  rank,
  level,
  wins,
  streak,
  xp,
  xpMax,
  online = true,
}: UserCardProps) {
  const filled = Math.max(0, Math.min(10, Math.round((xp / xpMax) * 10)));

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={rootRef} className={styles.root}>
      <Sketch
        variant={2}
        className={styles.card}
        onClick={() => setMenuOpen((v) => !v)}
        role="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <div className={styles.avatarBox}>
          <div className={styles.avatar}>{initials}</div>
          {online && <span className={styles.online} />}
        </div>

        <div className={styles.nameRow}>
          <span className={styles.username}>@{username}</span>
          <span className={styles.rank}>{rank}</span>
        </div>

        <div className={styles.stats}>
          <span>LVL <b>{level}</b></span>
          <span className={styles.sep}>·</span>
          <span><b>{wins}</b> WINS</span>
          <span className={styles.sep}>·</span>
          <span><b>{streak}</b> STREAK</span>
        </div>

        <div className={styles.xpRow}>
          <div className={styles.xpBar}>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={i < filled ? styles.on : ""} />
            ))}
          </div>
          <span className={styles.xpNum}>{xp}/{xpMax}</span>
        </div>
      </Sketch>

      {menuOpen && (
        <div className={styles.menu} role="menu">
          <a href="/profile" className={styles.menuItem} role="menuitem">
            VIEW PROFILE
          </a>
          <a href="/settings" className={styles.menuItem} role="menuitem">
            SETTINGS
          </a>
          <form action={logoutAction}>
            <button type="submit" className={styles.menuItem} role="menuitem">
              LOG OUT
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
