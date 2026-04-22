import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({ ready: z.boolean() });

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/ready">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = await rateLimit(`roommut:${session.user.id}`, RATE_LIMITS.roomMutation);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { code: rawCode } = await ctx.params;
  const room = await prisma.room.findUnique({
    where: { code: rawCode.toUpperCase() },
    select: { id: true, phase: true },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.phase !== "LOBBY") {
    return NextResponse.json({ error: "ready only in lobby" }, { status: 409 });
  }

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
    select: { id: true },
  });
  if (!player) return NextResponse.json({ error: "not in room" }, { status: 403 });

  await prisma.roomPlayer.update({
    where: { id: player.id },
    data: { isReady: parsed.data.ready },
  });
  return NextResponse.json({ ok: true });
}
