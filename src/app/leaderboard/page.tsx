import Link from "next/link";
import AppShell from "@/components/AppShell";
import Sketch from "@/components/Sketch";
import EmptyState from "@/components/EmptyState";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import styles from "./page.module.css";

// Next 16 does not cache fetch by default, and Prisma calls
// run fresh per request. Acceptable for leaderboard for now.
export const dynamic = "force-dynamic";

type Tab = "global" | "weekly" | "friends";

function parseTab(value: string | undefined): Tab {
  if (value === "weekly" || value === "friends") return value;
  return "global";
}

type Row = {
  id: string;
  username: string;
  initials: string;
  level: number;
  wins: number;
  xp: number;
  tier: string;
  rank: number;
  me?: boolean;
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireUser();
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  let rows: Row[] = [];

  if (tab === "global") {
    const top = await prisma.user.findMany({
      where: { showOnLeaderboard: true },
      orderBy: { xp: "desc" },
      take: 20,
      select: { id: true, username: true, initials: true, level: true, wins: true, xp: true, tier: true },
    });
    rows = top.map((u, i) => ({ ...u, rank: i + 1, me: u.id === me.id }));

    if (me.showOnLeaderboard && !rows.some((r) => r.me)) {
      const higher = await prisma.user.count({
        where: { xp: { gt: me.xp }, showOnLeaderboard: true },
      });
      rows.push({
        id: me.id,
        username: me.username,
        initials: me.initials,
        level: me.level,
        wins: me.wins,
        xp: me.xp,
        tier: me.tier,
        rank: higher + 1,
        me: true,
      });
    }
  } else if (tab === "weekly") {
    // Sum xpAwarded over the last 7 days from BattleResult, grouped by user.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const grouped = await prisma.battleResult.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since } },
      _sum: { xpAwarded: true },
      _count: { _all: true },
      orderBy: { _sum: { xpAwarded: "desc" } },
      take: 20,
    });
    if (grouped.length > 0) {
      const userIds = grouped.map((g) => g.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, showOnLeaderboard: true },
        select: { id: true, username: true, initials: true, level: true, tier: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      rows = grouped
        .filter((g) => byId.has(g.userId))
        .map((g, i) => {
          const u = byId.get(g.userId)!;
          return {
            id: u.id,
            username: u.username,
            initials: u.initials,
            level: u.level,
            wins: g._count._all, // battles played this week
            xp: g._sum.xpAwarded ?? 0, // weekly XP
            tier: u.tier,
            rank: i + 1,
            me: u.id === me.id,
          };
        });
    }
  } else {
    // FRIENDS — accepted friendships + self, sorted by XP.
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: me.id }, { addresseeId: me.id }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const ids = new Set<string>([me.id]);
    for (const f of friendships) {
      ids.add(f.requesterId);
      ids.add(f.addresseeId);
    }
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { xp: "desc" },
      take: 50,
      select: { id: true, username: true, initials: true, level: true, wins: true, xp: true, tier: true },
    });
    rows = users.map((u, i) => ({ ...u, rank: i + 1, me: u.id === me.id }));
  }

  const xpLabel = tab === "weekly" ? "7-DAY" : "XP";
  const winsLabel = tab === "weekly" ? "BTLS" : "WINS";

  return (
    <AppShell active="leaderboard" showFriends showRooms>
      <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
          <div className={styles.head}>
            <Link href="/" className={styles.backLink}>
              ← BACK
            </Link>
            <h1 className={styles.title}>
              LEADER<span>BOARD</span>
            </h1>
            <div className={styles.tabs}>
              <Link
                href="/leaderboard?tab=global"
                className={`${styles.tab} ${tab === "global" ? styles.tabActive : ""}`}
              >
                GLOBAL
              </Link>
              <Link
                href="/leaderboard?tab=weekly"
                className={`${styles.tab} ${tab === "weekly" ? styles.tabActive : ""}`}
              >
                WEEKLY
              </Link>
              <Link
                href="/leaderboard?tab=friends"
                className={`${styles.tab} ${tab === "friends" ? styles.tabActive : ""}`}
              >
                FRIENDS
              </Link>
            </div>
          </div>

          <div className={styles.tableHead}>
            <span>#</span>
            <span>PRODUCER</span>
            <span>LVL</span>
            <span>{winsLabel}</span>
            <span>{xpLabel}</span>
          </div>

          <div className={styles.list}>
            {rows.length === 0 && (
              <EmptyState
                icon={tab === "weekly" ? "7d" : tab === "friends" ? "@" : "#"}
                label={
                  tab === "weekly"
                    ? "NO BATTLES THIS WEEK"
                    : tab === "friends"
                    ? "NO FRIENDS YET"
                    : "NO PRODUCERS YET"
                }
                hint={
                  tab === "weekly"
                    ? "Battle this week to climb the chart."
                    : tab === "friends"
                    ? "Add producers to see how you stack up."
                    : "Be the first to drop a track."
                }
                cta={
                  tab === "friends"
                    ? { label: "+ ADD FRIEND", href: "/" }
                    : { label: "PLAY →", href: "/play" }
                }
              />
            )}
            {rows.map((u) => (
              <div
                key={u.id}
                className={`${styles.row} ${u.me ? styles.rowMe : ""}`}
              >
                <div className={styles.rank}>
                  {u.rank <= 3 ? (
                    <span
                      className={`${styles.rankMedal} ${
                        u.rank === 1
                          ? styles.rankGold
                          : u.rank === 2
                          ? styles.rankSilver
                          : styles.rankBronze
                      }`}
                    >
                      #{u.rank}
                    </span>
                  ) : (
                    `#${u.rank}`
                  )}
                </div>
                <div className={styles.user}>
                  <div className={styles.avatar}>{u.initials}</div>
                  <div>
                    <div className={styles.name}>@{u.username}</div>
                    <div className={styles.subName}>{u.tier}</div>
                  </div>
                </div>
                <span className={styles.lvl}>{u.level}</span>
                <span className={styles.wins}>{u.wins}</span>
                <span className={styles.xp}>{u.xp.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </Sketch>
    </AppShell>
  );
}
