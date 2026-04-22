import Link from "next/link";
import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import styles from "./page.module.css";

export default function PlayPage() {
  return (
    <AppShell showFriends showRooms>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
        <Link href="/" className={styles.backLink}>
          ← BACK
        </Link>

        <div className={styles.header}>
          <span className={styles.kicker}>SELECT MODE</span>
          <h1 className={styles.title}>
            PICK YOUR <span>ARENA</span>
          </h1>
          <p className={styles.sub}>
            Solo grind or go head-to-head with 15 other producers. Same samples,
            same clock.
          </p>
        </div>

        <div className={styles.modes}>
          <Link href="/play/quick" className={styles.modeLink}>
            <Sketch variant={2} className={styles.mode}>
              <div className={styles.modeTop}>
                <span>MODE 01</span>
                <span className={styles.modeTag}>INSTANT</span>
              </div>
              <div className={`${styles.modeName} ${styles.orange}`}>
                QUICK MATCH
              </div>
              <p className={styles.modeDesc}>
                Jump straight in. Matchmaker drops you into the first open
                battle with space. No setup, no wait.
              </p>
              <div className={styles.modeStats}>
                <span>
                  OPEN <b>47 ROOMS</b>
                </span>
                <span>
                  WAIT <b>&lt; 5s</b>
                </span>
                <span>
                  XP <b>+100</b>
                </span>
              </div>
              <span className={styles.modeCta}>FIND ROOM →</span>
            </Sketch>
          </Link>

          <Link href="/play/multiplayer" className={styles.modeLink}>
            <Sketch variant={3} className={styles.mode}>
              <div className={styles.modeTop}>
                <span>MODE 02</span>
                <span className={`${styles.modeTag} ${styles.live}`}>
                  LIVE 47
                </span>
              </div>
              <div className={styles.modeName}>MULTIPLAYER</div>
              <p className={styles.modeDesc}>
                Host your own room or join with a code. Control rules, length,
                genre — invite your friends.
              </p>
              <div className={styles.modeStats}>
                <span>
                  PLAYERS <b>2 – 16</b>
                </span>
                <span>
                  LEN <b>15 · 20 · 30 · 60M</b>
                </span>
                <span>
                  RANK <b>BRONZE III</b>
                </span>
              </div>
              <span className={styles.modeCta}>CREATE / JOIN →</span>
            </Sketch>
          </Link>
        </div>
        </div>
      </Sketch>
    </AppShell>
  );
}
