"use client";

import React, { useState } from "react";
import Link from "next/link";
import Sketch from "./Sketch";
import Mascot from "./Mascot";
import NotificationsModal from "./NotificationsModal";
import { useAudioMute } from "./AudioMute";
import styles from "./BrandPlate.module.css";

export type NavKey = "home" | "leaderboard" | "shop" | "profile";

export type BrandPlateProps = {
  active?: NavKey;
  online?: number;
  battles?: number;
  notifications?: number;
  onNotifClick?: () => void;
};

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "home",        label: "HOME",    href: "/" },
  { key: "leaderboard", label: "LEADER",  href: "/leaderboard" },
  { key: "shop",        label: "SHOP",    href: "/shop" },
  { key: "profile",     label: "PROFILE", href: "/profile" },
];

function formatNumber(n: number) {
  return n.toLocaleString("en-US");
}

export default function BrandPlate({
  active = "home",
  online = 1284,
  battles = 47,
  notifications = 3,
  onNotifClick,
}: BrandPlateProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { muted, toggle: toggleMute } = useAudioMute();
  const handleNotif = () => {
    if (onNotifClick) onNotifClick();
    else setNotifOpen(true);
  };

  return (
    <>
    <Sketch variant={1} className={styles.plate}>
      <div className={styles.logo}>
        <Mascot scale={0.17} shadow={false} animated={false} />
      </div>

      <div className={styles.titleRow}>
        <div className={styles.title}>
          BEAT <span>BATTLE</span>
        </div>
        <div className={styles.actionGroup}>
          <button
            className={styles.muteBtn}
            onClick={toggleMute}
            data-muted={muted}
            aria-label={muted ? "Unmute audio" : "Mute audio"}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="2" y="6" width="2" height="4" />
                <rect x="4" y="5" width="2" height="6" />
                <rect x="6" y="3" width="3" height="10" />
                <rect x="9" y="6" width="2" height="1" />
                <rect x="11" y="7" width="1" height="1" />
                <rect x="12" y="8" width="1" height="1" />
                <rect x="13" y="9" width="1" height="1" />
                <rect x="9" y="10" width="2" height="1" />
                <rect x="11" y="9" width="1" height="1" />
                <rect x="12" y="10" width="1" height="1" />
                <rect x="13" y="11" width="1" height="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="2" y="6" width="2" height="4" />
                <rect x="4" y="5" width="2" height="6" />
                <rect x="6" y="3" width="3" height="10" />
                <rect x="10" y="5" width="1" height="6" />
                <rect x="11" y="3" width="1" height="10" />
                <rect x="12" y="5" width="1" height="6" />
              </svg>
            )}
          </button>
          <button
            className={styles.notifBtn}
            onClick={handleNotif}
            aria-label={`Notifications${
              notifications > 0 ? ` (${notifications} unread)` : ""
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="5" y="2" width="6" height="1" />
              <rect x="4" y="3" width="8" height="1" />
              <rect x="3" y="4" width="10" height="6" />
              <rect x="2" y="10" width="12" height="1" />
              <rect x="7" y="12" width="2" height="2" />
            </svg>
            {notifications > 0 && (
              <span className={styles.notifDot}>
                {notifications > 9 ? "9+" : notifications}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className={styles.statsRow}>
        <span className={styles.stat}>
          <span className={styles.liveDot} />
          <b>{formatNumber(online)}</b> ON
        </span>
        <span className={styles.statSep}>·</span>
        <span className={styles.stat}>
          <b>{battles}</b> BATTLES
        </span>
      </div>

      <div className={styles.navInline}>
        {NAV.map((item, i) => (
          <React.Fragment key={item.key}>
            {i > 0 && <span className={styles.navSep}>·</span>}
            <Link
              href={item.href}
              className={`${styles.navInlineBtn} ${
                active === item.key ? styles.navInlineBtnActive : ""
              }`}
            >
              {item.label}
            </Link>
          </React.Fragment>
        ))}
      </div>
    </Sketch>
    <NotificationsModal open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
