import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getRoomState } from "@/lib/battle";

/**
 * Room state — the client polls this every ~2s.
 *
 * Access rules:
 *  - Members always see the full state (with VOTING-phase redaction applied).
 *  - Non-members can see PUBLIC rooms that are still in LOBBY (so the
 *    auto-join flow can render); that leaks nothing sensitive because any
 *    user can see those rooms in the public rooms panel anyway.
 *  - PRIVATE rooms and in-progress rooms require membership. This stops
 *    outsiders from (a) peeking at private sessions, (b) reading redacted
 *    voting state, and (c) triggering phase advances via polling.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const gate = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      phase: true,
      privacy: true,
      players: {
        where: { userId: session.user.id },
        select: { id: true },
      },
    },
  });
  if (!gate) return NextResponse.json({ error: "room not found" }, { status: 404 });

  const isMember = gate.players.length > 0;
  const isOpenLobby = gate.phase === "LOBBY" && gate.privacy === "PUBLIC";
  if (!isMember && !isOpenLobby) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Non-members never trigger phase advance; pass null viewerId so redaction
  // treats them as observers without "their own" track.
  const viewerId = isMember ? session.user.id : null;
  const room = await getRoomState(code, viewerId);
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });

  const myTrack = room.tracks.find((t) => t.mine);

  return NextResponse.json({
    room,
    me: {
      id: session.user.id,
      username: session.user.username,
      inRoom: isMember,
      submitted: Boolean(myTrack),
    },
    serverTime: new Date().toISOString(),
  });
}
