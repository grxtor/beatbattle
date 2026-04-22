import Link from "next/link";
import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import EmptyState from "@/components/EmptyState";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { nextLevelXp, rankShort } from "@/lib/game";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function relativeTime(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${Math.max(diff, 1)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function genreDisplay(g: string) {
  if (g === "LOFI") return "LO-FI";
  if (g === "HIPHOP") return "HIP-HOP";
  return g;
}

export default async function ProfilePage() {
  const me = await requireUser();

  const [battleCount, insaneCount, allBadges, earnedBadges, recent] = await Promise.all([
    prisma.battleResult.count({ where: { userId: me.id } }),
    prisma.vote.count({
      where: { rating: "INSANE", track: { userId: me.id } },
    }),
    prisma.badge.findMany({ orderBy: { id: "asc" } }),
    prisma.userBadge.findMany({
      where: { userId: me.id },
      select: { badgeId: true },
    }),
    prisma.battleResult.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        room: { select: { code: true, name: true, genre: true, lengthMin: true } },
      },
    }),
  ]);

  const earnedSet = new Set(earnedBadges.map((b) => b.badgeId));
  const winRate = battleCount > 0 ? Math.round((me.wins / battleCount) * 100) : 0;
  const xpMax = nextLevelXp(me.xp);
  const filled = Math.max(0, Math.min(14, Math.round((me.xp / xpMax) * 14)));

  return (
    <AppShell active="profile" showFriends showRooms>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
          <header className={styles.hero}>
            <div className={styles.avatar}>{me.initials}</div>
            <div className={styles.heroText}>
              <span className={styles.heroName}>@{me.username}</span>
              <span className={styles.heroSub}>
                <b>{rankShort(me.tier)}</b> · LVL <b>{me.level}</b> ·{" "}
                <b>{me.wins}</b> WINS · <b>{me.streak}</b> STREAK
              </span>
            </div>
            <div className={styles.heroActions}>
              <Link href="/settings" className={styles.heroBtn}>
                EDIT
              </Link>
            </div>
          </header>

          {me.bio && (
            <div className={styles.bioBlock}>{me.bio}</div>
          )}

          <div className={styles.statsGrid}>
            <Sketch variant={1} className={styles.stat}>
              <span className={styles.statLabel}>BATTLES</span>
              <span className={styles.statValue}>{battleCount}</span>
            </Sketch>
            <Sketch variant={2} className={styles.stat}>
              <span className={styles.statLabel}>WIN RATE</span>
              <span className={`${styles.statValue} ${styles.orange}`}>{winRate}%</span>
            </Sketch>
            <Sketch variant={3} className={styles.stat}>
              <span className={styles.statLabel}>INSANE</span>
              <span className={styles.statValue}>{insaneCount}</span>
            </Sketch>
            <Sketch variant={1} className={styles.stat}>
              <span className={styles.statLabel}>STREAK</span>
              <span className={`${styles.statValue} ${styles.orange}`}>{me.streak}</span>
            </Sketch>
          </div>

          <Sketch variant={2} className={styles.xpRow}>
            <span className={styles.xpLbl}>LVL {me.level}</span>
            <div className={styles.xpBar}>
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} className={i < filled ? styles.on : ""} />
              ))}
            </div>
            <span className={styles.xpNum}>
              {me.xp} / {xpMax}
            </span>
          </Sketch>

          <div className={styles.sectionTitle}>BADGES</div>
          <div className={styles.badges}>
            {allBadges.map((b) => {
              const earned = earnedSet.has(b.id);
              const locked =
                !earned && (b.unlockLvl ? me.level < b.unlockLvl : false);
              return (
                <Sketch
                  key={b.id}
                  variant={((b.id % 3) + 1) as 1 | 2 | 3}
                  className={`${styles.badge} ${!earned ? styles.locked : ""}`}
                >
                  <span className={styles.badgeIcon}>{b.icon}</span>
                  <span className={styles.badgeName}>{b.name}</span>
                  {locked && b.unlockLvl && (
                    <span style={{ fontSize: 7, color: "var(--text-faint)" }}>LVL {b.unlockLvl}</span>
                  )}
                </Sketch>
              );
            })}
          </div>

          <div className={styles.sectionTitle}>RECENT BATTLES</div>
          <div className={styles.history}>
            {recent.length === 0 && (
              <EmptyState
                compact
                icon="0"
                label="NO BATTLES YET"
                hint="Start your first battle and start earning XP."
                cta={{ label: "PLAY →", href: "/play" }}
              />
            )}
            {recent.map((r) => (
              <div key={`${r.roomId}-${r.userId}`} className={styles.histRow}>
                <span
                  className={`${styles.histRank} ${
                    r.place === 1 ? styles.first :
                    r.place === 2 ? styles.second :
                    r.place === 3 ? styles.third : ""
                  }`}
                >
                  #{r.place}
                </span>
                <div className={styles.histBody}>
                  <span className={styles.histName}>Room {r.room.code}</span>
                  <span className={styles.histSub}>
                    {genreDisplay(r.room.genre)} · {r.room.lengthMin}M · score {r.trackScore}
                  </span>
                </div>
                <span className={styles.histXp}>+{r.xpAwarded} XP</span>
                <span className={styles.histTime}>{relativeTime(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </Sketch>
    </AppShell>
  );
}
