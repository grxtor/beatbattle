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
 * Presence pings are also a good opportunity to sweep abandoned rooms.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const limit = rateLimit(`presence:${session.user.id}`, RATE_LIMITS.presence);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: new Date(), online: true },
    select: { id: true },
  });

  // fire-and-forget, throttled internally to once per 60s
  void cleanupAbandonedRooms();

  return NextResponse.json({ ok: true });
}
