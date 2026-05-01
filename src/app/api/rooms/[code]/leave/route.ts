import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { postSystemMessage } from "@/lib/chat";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Leave a room. Race-safe: all state transitions happen under a FOR UPDATE
 * lock on the Room row, so concurrent leaves can't strand the room with a
 * deleted host or promote the same successor twice.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/leave">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = await rateLimit(`roommut:${session.user.id}`, RATE_LIMITS.roomMutation);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });

  const userId = session.user.id;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;

    // Re-read membership under the lock. We also pull username so the system
    // message can mention them by handle.
    const me = await tx.roomPlayer.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
      select: {
        id: true,
        isHost: true,
        user: { select: { username: true } },
      },
    });
    if (!me) return { notIn: true as const };

    await tx.roomPlayer.delete({ where: { id: me.id } });

    if (!me.isHost) {
      await postSystemMessage(room.id, `@${me.user.username} left the battle.`, tx);
      return { ok: true as const };
    }

    // Host departure: pick successor from fresh post-delete state.
    const successor = await tx.roomPlayer.findFirst({
      where: { roomId: room.id },
      orderBy: { joinedAt: "asc" },
      select: { id: true, userId: true, user: { select: { username: true } } },
    });

    if (successor) {
      await tx.roomPlayer.update({
        where: { id: successor.id },
        data: { isHost: true, isReady: true },
      });
      await tx.room.update({
        where: { id: room.id },
        data: { hostId: successor.userId },
      });
      await postSystemMessage(
        room.id,
        `@${me.user.username} left — @${successor.user.username} is now host.`,
        tx,
      );
    } else {
      await tx.room.update({
        where: { id: room.id },
        data: { phase: "CANCELLED", endedAt: new Date() },
      });
      await postSystemMessage(
        room.id,
        `Room cancelled — host left.`,
        tx,
      );
    }
    return { ok: true as const };
  });

  if ("notIn" in result) return NextResponse.json({ ok: true, notIn: true });
  return NextResponse.json({ ok: true });
}
