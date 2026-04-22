"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sketch from "./Sketch";
import Mascot from "./Mascot";
import styles from "./WelcomeTour.module.css";

const KEY = "beatbattle.tour.seen.v1";

export type WelcomeTourProps = {
  username: string;
};

export default function WelcomeTour({ username }: WelcomeTourProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(KEY);
      if (!seen) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const start = () => {
    dismiss();
    router.push("/play/quick");
  };

  return (
    <div className={styles.root} role="dialog" aria-modal="true">
      <Sketch variant={1} className={styles.card}>
        <div className={styles.mascotWrap}>
          <Mascot scale={1.3} />
        </div>
        <span className={styles.kicker}>WELCOME PRODUCER</span>
        <h2 className={styles.title}>
          @{username}, READY TO <span>BATTLE?</span>
        </h2>
        <p className={styles.body}>
          Drop tracks against other producers in real time. Same samples,
          same clock — vote, win XP, climb the chart.
        </p>

        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <span>QUICK MATCH — drop into a live battle right now.</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <span>PRODUCE — flip 4 samples in the time limit.</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <span>VOTE — anonymous tracks, fairest beat wins.</span>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.skip} type="button" onClick={dismiss}>
            SKIP
          </button>
          <button className={styles.go} type="button" onClick={start}>
            FIND BATTLE →
          </button>
        </div>
      </Sketch>
    </div>
  );
}
