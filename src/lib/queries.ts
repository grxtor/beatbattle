import "server-only";
import { prisma } from "@/lib/prisma";
import type { Friend } from "@/components/FriendsPanel";
import type { Room as RoomCardShape } from "@/components/RoomsPanel";
import { cleanupAbandonedRooms } from "@/lib/roomCleanup";

/** A user counts as online if they pinged within the last N minutes. */
export const ONLINE_WINDOW_MIN = 2;

export function onlineCutoff(): Date {
  return new Date(Date.now() - ONLINE_WINDOW_MIN * 60_000);
}

const ACTIVE_PHASES = ["LOBBY", "REVEAL", "PRODUCTION", "UPLOAD", "VOTING"] as const;

/** Return the friend list enriched with presence + active-room info. */
export async function getFriendsFor(userId: string): Promise<{
  online: Friend[];
  offline: Friend[];
}> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: {
        select: {
          id: true, username: true, initials: true, level: true, lastSeenAt: true,
          roomPlayers: {
            where: { room: { phase: { in: [...ACTIVE_PHASES] } } },
            select: { room: { select: { code: true, phase: true } } },
            take: 1,
          },
        },
      },
      addressee: {
        select: {
          id: true, username: true, initials: true, level: true, lastSeenAt: true,
          roomPlayers: {
            where: { room: { phase: { in: [...ACTIVE_PHASES] } } },
            select: { room: { select: { code: true, phase: true } } },
            take: 1,
          },
        },
      },
    },
  });

  const cutoff = onlineCutoff().getTime();
  const online: Friend[] = [];
  const offline: Friend[] = [];

  for (const f of friendships) {
    const u = f.requesterId === userId ? f.addressee : f.requester;
    const lastSeen = u.lastSeenAt.getTime();
    const isOnline = lastSeen >= cutoff;
    const inRoom = u.roomPlayers[0]?.room;

    const base = {
      name: u.username,
      initials: u.initials,
      level: u.level,
    };

    if (isOnline) {
      if (inRoom) {
        online.push({
          ...base,
          status: "inroom",
          statusText: `In ${inRoom.code}`,
          roomCode: inRoom.code,
        });
      } else {
        online.push({
          ...base,
          status: "online",
          statusText: "Online",
          roomCode: null,
        });
      }
    } else {
      offline.push({
        ...base,
        status: "offline",
        statusText: relativeTime(u.lastSeenAt),
        roomCode: null,
      });
    }
  }

  // online list: in-room friends first
  online.sort((a, b) => {
    const rank = (s: Friend["status"]) => (s === "inroom" ? 0 : 1);
    return rank(a.status) - rank(b.status);
  });

  return { online, offline };
}

/** Return active public rooms shaped for RoomsPanel.
 *
 * A room counts as "live" when ANY of these is true:
 *  1. Any player in the room (host or otherwise) has pinged presence within
 *     the online window — so a stale seed room stays dead but the moment
 *     someone real joins, it lights up.
 *  2. The room was just created (last 5 min) — covers the brief window right
 *     after host creation when nobody has pinged yet.
 *  3. It's the current user's room (they're obviously here).
 * Phases must be active (LOBBY … VOTING).
 */
export async function getPublicRooms(
  viewerId?: string,
  limit = 8,
): Promise<RoomCardShape[]> {
  // opportunistic: throttled internally to once per 60s
  void cleanupAbandonedRooms();

  const cutoff = onlineCutoff();
  const justCreated = new Date(Date.now() - 5 * 60_000);

  const rooms = await prisma.room.findMany({
    where: {
      privacy: "PUBLIC",
      phase: { in: [...ACTIVE_PHASES] },
      OR: [
        { players: { some: { user: { lastSeenAt: { gte: cutoff } } } } },
        { createdAt: { gte: justCreated } },
        ...(viewerId
          ? [{ players: { some: { userId: viewerId } } }]
          : []),
      ],
    },
    orderBy: [
      { featured: "desc" as const },
      { createdAt: "desc" as const },
    ],
    take: limit * 2,
    include: {
      host: { select: { username: true, level: true } },
      players: viewerId
        ? { where: { userId: viewerId }, select: { userId: true }, take: 1 }
        : false,
      _count: { select: { players: true } },
    },
  });

  // Viewer's own room floats to the top.
  rooms.sort((a, b) => {
    const aMine = viewerId && a.players?.length ? 0 : 1;
    const bMine = viewerId && b.players?.length ? 0 : 1;
    return aMine - bMine;
  });

  const trimmed = rooms.slice(0, limit);

  return trimmed.map((r) => ({
    code: r.code,
    name: r.name,
    host: r.host.username,
    hostLvl: r.host.level,
    genre: displayGenre(r.genre),
    length: `${r.lengthMin}M`,
    players: r._count.players,
    max: r.maxPlayers,
    timeLeft: timeLeftFor(r),
    featured: r.featured,
  }));
}

/** Return the active room the user is currently a player in, if any.
 *  Used by AppShell to surface a "RETURN TO BATTLE" pill on every page. */
export async function getActiveRoomFor(userId: string): Promise<
  | {
      code: string;
      name: string;
      phase: (typeof ACTIVE_PHASES)[number];
      genre: string;
    }
  | null
> {
  const player = await prisma.roomPlayer.findFirst({
    where: {
      userId,
      room: { phase: { in: [...ACTIVE_PHASES] } },
    },
    select: {
      room: { select: { code: true, name: true, phase: true, genre: true } },
    },
    orderBy: { joinedAt: "desc" },
  });
  if (!player) return null;
  return {
    code: player.room.code,
    name: player.room.name,
    phase: player.room.phase as (typeof ACTIVE_PHASES)[number],
    genre: displayGenre(player.room.genre),
  };
}

/** How many users are currently online. */
export async function getOnlineUserCount(): Promise<number> {
  return prisma.user.count({
    where: { lastSeenAt: { gte: onlineCutoff() } },
  });
}

/** Count of currently active battle rooms. */
export async function getActiveRoomCount(): Promise<number> {
  return prisma.room.count({
    where: { phase: { in: [...ACTIVE_PHASES] } },
  });
}

function displayGenre(g: string): string {
  if (g === "LOFI") return "LO-FI";
  if (g === "HIPHOP") return "HIP-HOP";
  return g;
}

function timeLeftFor(r: { phase: string; phaseEndsAt: Date | null; lengthMin: number }): string {
  if (!r.phaseEndsAt) return `${r.lengthMin}M`;
  const diff = Math.max(0, r.phaseEndsAt.getTime() - Date.now());
  const total = Math.floor(diff / 1000);
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function relativeTime(d: Date): string {
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
