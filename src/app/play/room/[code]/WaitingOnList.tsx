"use client";

import styles from "./page.module.css";

type Player = {
  id: string;
  userId: string;
  isHost: boolean;
  hasSubmitted: boolean;
  user: { id: string; username: string };
};

type Props = {
  players: Player[];
  /** Already-formatted countdown string for the "voting starts in X" hint. */
  countdownLabel: string;
};

/**
 * UPLOAD-phase "waiting on" indicator. Once everyone is in we flip to the
 * voting-starts countdown so the room reads as a single, calm timeline rather
 * than a wall of empty chips.
 */
export default function WaitingOnList({ players, countdownLabel }: Props) {
  const pending = players.filter((p) => !p.hasSubmitted);

  if (pending.length === 0) {
    return (
      <div className={styles.waitingDone}>
        All tracks in. Voting starts in {countdownLabel}.
      </div>
    );
  }

  return (
    <div className={styles.waitingWrap}>
      <span className={styles.waitingLbl}>Waiting on:</span>
      <div className={styles.waitingChips}>
        {pending.map((p) => (
          <span key={p.id} className={styles.waitingChip}>
            @{p.user.username}
          </span>
        ))}
      </div>
    </div>
  );
}
