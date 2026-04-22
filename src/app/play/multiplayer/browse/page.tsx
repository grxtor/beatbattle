import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import { getCurrentUser } from "@/lib/session";
import { getPublicRooms } from "@/lib/queries";
import BrowseClient from "./BrowseClient";
import styles from "./page.module.css";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const viewer = await getCurrentUser();
  const initial = await getPublicRooms(viewer?.id, 30);

  return (
    <AppShell>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
          <Link href="/play/multiplayer" className={styles.backLink}>
            ← BACK
          </Link>

          <div className={styles.header}>
            <span className={styles.kicker}>BROWSE PUBLIC ROOMS</span>
            <h1 className={styles.title}>
              FIND A <span>BATTLE</span>
            </h1>
            <p className={styles.sub}>
              Live public rooms across every phase. Click one to jump in — full
              rooms are locked out automatically.
            </p>
          </div>

          <BrowseClient initialRooms={initial} />
        </div>
      </Sketch>
    </AppShell>
  );
}
