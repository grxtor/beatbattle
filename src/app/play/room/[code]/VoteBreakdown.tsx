"use client";

import styles from "./page.module.css";

type VoteRating = "INSANE" | "VERY_GOOD" | "GOOD" | "OKAY" | "BAD" | "VERY_BAD";

const DISPLAY: Record<VoteRating, string> = {
  INSANE: "INSANE",
  VERY_GOOD: "VG",
  GOOD: "GOOD",
  OKAY: "OKAY",
  BAD: "BAD",
  VERY_BAD: "VB",
};

type Props = {
  breakdown: { rating: VoteRating; count: number }[];
};

/**
 * Compact per-track vote tally surfaced in RESULTS rows. Hidden when there
 * are no votes (e.g. a kicked submitter or an aborted battle).
 */
export default function VoteBreakdown({ breakdown }: Props) {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div className={styles.voteBreak}>
      {breakdown.map((b) => (
        <span key={b.rating} className={styles.voteBreakChip}>
          {b.count}× {DISPLAY[b.rating]}
        </span>
      ))}
    </div>
  );
}
