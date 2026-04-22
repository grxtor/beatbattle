"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sketch from "@/components/Sketch";
import styles from "./page.module.css";

type Phase = "searching" | "none";

export default function QuickMatch() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("searching");
  const [scanIndex, setScanIndex] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  // Fake matchmaking scan + real quick-match call run in parallel.
  useEffect(() => {
    if (phase !== "searching") return;
    let cancelled = false;

    const ticker = setInterval(() => setScanIndex((i) => i + 1), 280);

    (async () => {
      // minimum 1.5s delay so it feels like a real search
      const delay = new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch("/api/rooms/quick", { method: "POST" });
        await delay;
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { code: string };
          router.push(`/play/room/${data.code}`);
          return;
        }
        setPhase("none");
      } catch {
        if (!cancelled) {
          setErr("connection error");
          setPhase("none");
        }
      } finally {
        clearInterval(ticker);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, [phase, router]);

  const requeue = () => {
    setErr(null);
    setPhase("searching");
    setScanIndex(0);
  };

  return (
    <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
        <Link href="/play" className={styles.backLink}>
          ← CANCEL
        </Link>

        <div className={styles.center}>
          {phase === "searching" ? (
            <>
              <span className={styles.kicker}>SCANNING ROOMS</span>
              <h1 className={styles.headline}>
                FINDING YOUR <span>BATTLE</span>
              </h1>
              <p className={styles.sub}>
                Matching you with an open room. Clock is rolling, samples
                already dropped.
              </p>

              <div className={styles.scanBar}>
                <div className={styles.scanBarTrack}>
                  <div className={styles.scanBarFill} />
                </div>
                <div className={styles.scanLabel}>
                  <span>SCANNING 47 LIVE</span>
                  <span>
                    <b>{30 + scanIndex}</b> CHECKED
                  </span>
                </div>
              </div>

              <div className={styles.dots}>
                <span />
                <span />
                <span />
              </div>
            </>
          ) : (
            <>
              <span className={`${styles.kicker}`}>NO OPEN ROOMS</span>
              <h1 className={styles.headline}>
                NOBODY&apos;S <span>BATTLING</span>
              </h1>
              <p className={styles.sub}>
                {err ?? "No open public lobbies right now. Create one or search again."}
              </p>

              <div className={styles.actions}>
                <button className={styles.btnGhost} onClick={requeue}>
                  SEARCH AGAIN
                </button>
                <Link
                  href="/play/multiplayer/create"
                  className={styles.btnPrimary}
                >
                  CREATE ROOM →
                </Link>
              </div>
            </>
          )}
        </div>
        </div>
    </Sketch>
  );
}
