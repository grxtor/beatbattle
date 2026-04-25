import BrandPlate from "./BrandPlate";
import UserCard from "./UserCard";
import FriendsPanel from "./FriendsPanel";
import RoomsPanel from "./RoomsPanel";
import Mascot from "./Mascot";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { nextLevelXp, rankShort } from "@/lib/game";
import {
  getFriendsFor,
  getPublicRooms,
  getOnlineUserCount,
  getActiveRoomCount,
  getActiveRoomFor,
} from "@/lib/queries";
import ActiveBattleBanner from "./ActiveBattleBanner";
import styles from "./AppShell.module.css";

export type AppShellProps = {
  active?: "home" | "leaderboard" | "shop" | "profile";
  showMascot?: boolean;
  showFriends?: boolean;
  showRooms?: boolean;
  /** In-game screens: shrink the top bars and pull content up. */
  compact?: boolean;
  children: React.ReactNode;
};

export default async function AppShell({
  active,
  showMascot = true,
  showFriends = true,
  showRooms = true,
  compact = false,
  children,
}: AppShellProps) {
  const user = await getCurrentUser();
  const [
    onlineCount,
    activeRoomsCount,
    unreadNotifs,
    friendLists,
    publicRooms,
    activeRoom,
  ] = await Promise.all([
    getOnlineUserCount(),
    getActiveRoomCount(),
    user
      ? prisma.notification.count({ where: { userId: user.id, read: false } })
      : Promise.resolve(0),
    user
      ? getFriendsFor(user.id)
      : Promise.resolve({ online: [], offline: [] }),
    showRooms ? getPublicRooms(user?.id) : Promise.resolve([]),
    user ? getActiveRoomFor(user.id) : Promise.resolve(null),
  ]);

  const pageCls = `${styles.page} ${compact ? styles.pageCompact : ""}`.trim();
  const brandCls = `${styles.brandSlot} ${compact ? styles.brandSlotCompact : ""}`.trim();
  const userCls = `${styles.userSlot} ${compact ? styles.userSlotCompact : ""}`.trim();
  const focusOnly = !showFriends && !showRooms;
  const isHome = active === "home" || active === undefined;
  const smallMascot = showMascot && !isHome;
  const modeCls = focusOnly
    ? compact
      ? styles.layoutImmersive
      : styles.layoutFocus
    : !showMascot
    ? styles.layoutNoMascot
    : smallMascot
    ? styles.layoutSmallMascot
    : "";
  const layoutCls = `${styles.layout} ${modeCls}`.trim();
  const mascotScale = isHome ? 1.05 : 0.6;

  return (
    <main className={pageCls}>
      {activeRoom && (
        <ActiveBattleBanner
          code={activeRoom.code}
          name={activeRoom.name}
          phase={activeRoom.phase}
          genre={activeRoom.genre}
        />
      )}
      <div className={brandCls}>
        <BrandPlate
          active={active}
          online={onlineCount}
          battles={activeRoomsCount}
          notifications={unreadNotifs}
        />
      </div>
      <div className={userCls}>
        {user && (
          <UserCard
            username={user.username}
            initials={user.initials}
            rank={rankShort(user.tier)}
            level={user.level}
            wins={user.wins}
            streak={user.streak}
            xp={user.xp}
            xpMax={nextLevelXp(user.xp)}
            online={user.online}
          />
        )}
      </div>

      <div className={layoutCls}>
        {/* Mascot row is always reserved so panels align across pages.
            Slot is empty when showMascot is false. */}
        <div className={styles.mascotSlot}>
          {showMascot && <Mascot scale={mascotScale} />}
        </div>

        {showFriends && (
          <FriendsPanel
            online={friendLists.online}
            offline={friendLists.offline}
            className={styles.friendsSlot}
            inviteRoomCode={activeRoom?.code ?? null}
          />
        )}

        <div className={styles.centerSlot}>{children}</div>

        {showRooms && (
          <RoomsPanel
            rooms={publicRooms}
            liveCount={activeRoomsCount}
            className={styles.roomsSlot}
          />
        )}
      </div>
    </main>
  );
}
