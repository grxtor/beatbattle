import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { postSystemMessage } from "@/lib/chat";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Host-only: cut the current phase short.
 *
 * Sets `phaseEndsAt = now()` so the next call to `tickPhase` (any poll from
 * any member) advances the room. We don't directly call `advancePhaseIfDue`
 * here so all tick-driven side effects (system message, settlement, badge
 * awards) still fire from the canonical path.
 *
 * Rejected when:
 *  - Caller isn't authenticated.
 *  - Caller isn't the host.
 *  - Phase is LOBBY (use /start), RESULTS, or CANCELLED (terminal).
 *
 * Idempotent under concurrency: the inner `updateMany` filters by phase so
 * two simultaneous calls only succeed once even if the host doublesly clicks.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/skip-phase">,
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
    select: { id: true, hostId: true, phase: true },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "not host" }, { status: 403 });
  }
  if (room.phase === "LOBBY" || room.phase === "RESULTS" || room.phase === "CANCELLED") {
    return NextResponse.json({ error: "no active phase to skip" }, { status: 409 });
  }

  const phaseLabel = room.phase;

  await prisma.$transaction(async (tx) => {
    const res = await tx.room.updateMany({
      where: { id: room.id, phase: room.phase },
      data: { phaseEndsAt: new Date() },
    });
    if (res.count === 0) return;
    await postSystemMessage(
      room.id,
      `Host skipped ${phaseLabel} phase early.`,
      tx,
    );
  });

  return NextResponse.json({ ok: true });
}
