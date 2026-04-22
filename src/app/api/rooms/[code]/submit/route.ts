import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Track submit — MVP has no audio, just the "submitted" marker.
 * Later audioUrl will be the S3/R2-hosted upload URL.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/submit">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = await rateLimit(`submit:${session.user.id}`, RATE_LIMITS.submitTrack);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const { code: rawCode } = await ctx.params;
  const room = await prisma.room.findUnique({
    where: { code: rawCode.toUpperCase() },
    select: {
      id: true,
      phase: true,
      players: {
        where: { userId: session.user.id },
        select: { id: true },
      },
    },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.players.length === 0) {
    return NextResponse.json({ error: "not in room" }, { status: 403 });
  }
  if (room.phase !== "PRODUCTION" && room.phase !== "UPLOAD") {
    return NextResponse.json({ error: "submit window closed" }, { status: 409 });
  }

  const track = await prisma.track.upsert({
    where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
    update: { audioUrl: null },
    create: { roomId: room.id, userId: session.user.id, audioUrl: null },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, trackId: track.id });
}
