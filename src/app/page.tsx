import Link from "next/link";
import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import WelcomeTour from "@/components/WelcomeTour";
import { getCurrentUser } from "@/lib/session";
import styles from "./page.module.css";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <AppShell active="home" showMascot showFriends showRooms>
      <Sketch variant={1} className={styles.card}>
        <h1 className={styles.title}>
          BEAT <span>BATTLE</span>
        </h1>
        <div className={styles.buttons}>
          <Link href="/play" className={styles.btnLink}>
            <Sketch
              as="div"
              variant={1}
              className={`${styles.btn} ${styles.btnPlay}`}
            >
              PLAY
            </Sketch>
          </Link>
          <Link href="/leaderboard" className={styles.btnLink}>
            <Sketch as="div" variant={2} className={styles.btn}>
              LEADERBOARD
            </Sketch>
          </Link>
          <Link href="/shop" className={styles.btnLink}>
            <Sketch as="div" variant={3} className={styles.btn}>
              SHOP
            </Sketch>
          </Link>
        </div>
      </Sketch>
      {user && <WelcomeTour username={user.username} />}
    </AppShell>
  );
}
