import Link from "next/link";
import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import styles from "./page.module.css";

export default function MultiplayerPage() {
  return (
    <AppShell showFriends showRooms>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
        <Link href="/play" className={styles.backLink}>
          ← BACK
        </Link>

        <div className={styles.header}>
          <span className={styles.kicker}>MULTIPLAYER</span>
          <h1 className={styles.title}>
            HOST OR <span>JOIN</span>
          </h1>
          <p className={styles.sub}>
            Start your own battle with custom rules, or drop into an existing
            room with a 6-digit code.
          </p>
        </div>

        <div className={styles.actions}>
          <Link href="/play/multiplayer/create" className={styles.cardLink}>
            <Sketch variant={2} className={styles.card}>
              <div className={styles.icon}>+</div>
              <div className={`${styles.cardTitle} ${styles.orange}`}>
                CREATE ROOM
              </div>
              <p className={styles.cardDesc}>
                Set the rules — length, genre, max players, public or private.
                Share the code with friends.
              </p>
              <div className={styles.bullets}>
                <span className={styles.bullet}>PICK LENGTH & GENRE</span>
                <span className={styles.bullet}>UP TO 16 PLAYERS</span>
                <span className={styles.bullet}>PUBLIC OR INVITE-ONLY</span>
              </div>
              <span className={styles.cta}>SET UP →</span>
            </Sketch>
          </Link>

          <Link href="/play/multiplayer/join" className={styles.cardLink}>
            <Sketch variant={3} className={styles.card}>
              <div className={styles.icon}>#</div>
              <div className={styles.cardTitle}>JOIN ROOM</div>
              <p className={styles.cardDesc}>
                Got a code? Punch in 6 characters and drop into the battle.
                Clock is already rolling.
              </p>
              <div className={styles.bullets}>
                <span className={styles.bullet}>ENTER 6-DIGIT CODE</span>
                <span className={styles.bullet}>INSTANT JOIN</span>
                <span className={styles.bullet}>SCAN QR SUPPORT</span>
              </div>
              <span className={styles.cta}>ENTER CODE →</span>
            </Sketch>
          </Link>

          <Link href="/play/multiplayer/browse" className={styles.cardLink}>
            <Sketch variant={1} className={styles.card}>
              <div className={styles.icon}>⌕</div>
              <div className={styles.cardTitle}>BROWSE ROOMS</div>
              <p className={styles.cardDesc}>
                Scroll through live public rooms. Filter by genre or open
                seats, jump in with one click.
              </p>
              <div className={styles.bullets}>
                <span className={styles.bullet}>LIVE PUBLIC LIST</span>
                <span className={styles.bullet}>GENRE + SEAT FILTERS</span>
                <span className={styles.bullet}>AUTO-REFRESH</span>
              </div>
              <span className={styles.cta}>BROWSE →</span>
            </Sketch>
          </Link>
        </div>
        </div>
      </Sketch>
    </AppShell>
  );
}
