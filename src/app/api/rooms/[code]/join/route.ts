import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Join a room by code.
 *
 * Race-safe: we take a row-level `FOR UPDATE` lock on the Room row first,
 * so concurrent joins serialize on the specific room. The capacity check
 * and insert happen under that lock; two users racing for the last seat
 * cannot both win.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/join">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const limit = rateLimit(`join:${session.user.id}`, RATE_LIMITS.roomJoin);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: { id: true, code: true, maxPlayers: true, phase: true },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.phase === "RESULTS" || room.phase === "CANCELLED") {
    return NextResponse.json({ error: "room closed" }, { status: 409 });
  }
  if (room.phase !== "LOBBY") {
    return NextResponse.json({ error: "battle already started" }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;

      const alreadyIn = await tx.roomPlayer.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: session.user!.id } },
        select: { id: true },
      });
      if (alreadyIn) return { alreadyIn: true };

      const [count, fresh] = await Promise.all([
        tx.roomPlayer.count({ where: { roomId: room.id } }),
        tx.room.findUniqueOrThrow({
          where: { id: room.id },
          select: { phase: true, maxPlayers: true },
        }),
      ]);
      if (fresh.phase !== "LOBBY") throw new RoomClosedError();
      if (count >= fresh.maxPlayers) throw new RoomFullError();

      await tx.roomPlayer.create({
        data: { roomId: room.id, userId: session.user!.id },
      });
      return { alreadyIn: false };
    });

    return NextResponse.json({
      ok: true,
      alreadyIn: result.alreadyIn,
      room: { code: room.code },
    });
  } catch (err) {
    if (err instanceof RoomFullError) {
      return NextResponse.json({ error: "room full" }, { status: 409 });
    }
    if (err instanceof RoomClosedError) {
      return NextResponse.json({ error: "battle already started" }, { status: 409 });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Another tx raced us to create the membership row — treat as idempotent.
      return NextResponse.json({
        ok: true,
        alreadyIn: true,
        room: { code: room.code },
      });
    }
    console.error("[room/join]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

class RoomFullError extends Error {
  constructor() {
    super("room full");
    this.name = "RoomFullError";
  }
}
class RoomClosedError extends Error {
  constructor() {
    super("room closed");
    this.name = "RoomClosedError";
  }
}
