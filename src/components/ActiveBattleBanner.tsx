"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Sketch from "./Sketch";
import styles from "./ActiveBattleBanner.module.css";

const PHASE_KICKER: Record<string, string> = {
  LOBBY: "WAITING",
  REVEAL: "STARTING",
  PRODUCTION: "PRODUCING",
  UPLOAD: "UPLOADING",
  VOTING: "VOTING",
};

export type ActiveBattleBannerProps = {
  code: string;
  name: string;
  phase: string;
  genre: string;
};

export default function ActiveBattleBanner({
  code,
  name,
  phase,
  genre,
}: ActiveBattleBannerProps) {
  const pathname = usePathname() ?? "";
  // Hide while the user is already inside their battle.
  if (pathname.startsWith(`/play/room/${code}`)) return null;

  const kicker = PHASE_KICKER[phase] ?? "LIVE";

  return (
    <Sketch
      as={Link}
      variant={3}
      href={`/play/room/${code}`}
      className={styles.banner}
      aria-label={`Return to your battle in ${code}`}
      data-allow-leave="1"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.body}>
        <span className={styles.kicker}>{kicker}</span>
        <span className={styles.sep}>·</span>
        <span className={styles.code}>{code}</span>
        <span className={styles.sep}>·</span>
        <span className={styles.name}>
          {genre} · {name}
        </span>
      </span>
      <span className={styles.cta}>RETURN →</span>
    </Sketch>
  );
}
