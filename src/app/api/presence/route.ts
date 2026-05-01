import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cleanupAbandonedRooms } from "@/lib/roomCleanup";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Client pings this endpoint every 30s.
 * We bump User.lastSeenAt to now; presence is derived from
 * the "pinged within the last 2 minutes" rule.
 *
 * If the user is currently a member of any rooms, we ALSO bump every
 * RoomPlayer.lastPingAt for that user — that drives the in-room
 * `isOnline` field returned from getRoomState. The 90s in-room cutoff
 * means a single missed ping won't show a player as offline.
 *
 * Presence pings are also a good opportunity to sweep abandoned rooms.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const limit = await rateLimit(`presence:${session.user.id}`, RATE_LIMITS.presence);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const now = new Date();

  await Promise.all([
    prisma.user.update({
      where: { id: session.user.id },
      data: { lastSeenAt: now, online: true },
      select: { id: true },
    }),
    prisma.roomPlayer.updateMany({
      where: { userId: session.user.id },
      data: { lastPingAt: now },
    }),
  ]);

  // fire-and-forget, throttled internally to once per 60s
  void cleanupAbandonedRooms();

  return NextResponse.json({ ok: true });
}
