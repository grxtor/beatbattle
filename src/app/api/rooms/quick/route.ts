import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Quick match: pick the fullest LOBBY-phase public room that still has a seat.
 * (Fuller rooms start sooner.)
 *
 * The final seat grab goes through the same `FOR UPDATE`-guarded join path
 * used by /join so concurrent quick-match callers cannot overfill a room.
 * If the pick is full by the time we lock it, we retry the next candidate.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const limit = rateLimit(`quick:${session.user.id}`, RATE_LIMITS.quickMatch);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const candidates = await prisma.room.findMany({
    where: {
      privacy: "PUBLIC",
      phase: "LOBBY",
      players: { none: { userId: session.user.id } },
    },
    include: { _count: { select: { players: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const ranked = candidates
    .filter((r) => r._count.players < r.maxPlayers)
    .sort((a, b) => b._count.players - a._count.players);

  for (const room of ranked) {
    const joined = await prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;

        const fresh = await tx.room.findUniqueOrThrow({
          where: { id: room.id },
          select: { phase: true, maxPlayers: true, code: true },
        });
        if (fresh.phase !== "LOBBY") return null;

        const count = await tx.roomPlayer.count({ where: { roomId: room.id } });
        if (count >= fresh.maxPlayers) return null;

        await tx.roomPlayer.create({
          data: { roomId: room.id, userId: session.user!.id },
        });
        return fresh.code;
      })
      .catch((err) => {
        console.error("[rooms/quick] candidate fail", err);
        return null;
      });

    if (joined) {
      return NextResponse.json({ ok: true, code: joined });
    }
  }

  return NextResponse.json({ error: "no open room" }, { status: 404 });
}
