import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { postSystemMessage } from "@/lib/chat";
import { MAX_PHASE_EXTEND_SEC, PHASE_EXTEND_STEP_SEC } from "@/lib/battle";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Host-only: add `PHASE_EXTEND_STEP_SEC` (120s) to the active phase.
 *
 * Capped at `MAX_PHASE_EXTEND_SEC` (600s) per phase via `Room.extendedSec`,
 * which is reset to 0 each time the phase advances. Rejected when:
 *  - Caller isn't host.
 *  - Phase is terminal or LOBBY (no clock to extend).
 *  - Cap already reached.
 *
 * Race-safe: a single `update` mutates `phaseEndsAt` and `extendedSec`
 * atomically, and we re-check the budget under the same row read.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/extend">,
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
    select: {
      id: true,
      hostId: true,
      phase: true,
      phaseEndsAt: true,
      extendedSec: true,
    },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "not host" }, { status: 403 });
  }
  if (
    room.phase === "LOBBY" ||
    room.phase === "RESULTS" ||
    room.phase === "CANCELLED" ||
    !room.phaseEndsAt
  ) {
    return NextResponse.json({ error: "no active phase" }, { status: 409 });
  }

  if (room.extendedSec + PHASE_EXTEND_STEP_SEC > MAX_PHASE_EXTEND_SEC) {
    return NextResponse.json(
      { error: "extend cap reached", extendedSec: room.extendedSec },
      { status: 409 },
    );
  }

  const newEndsAt = new Date(
    room.phaseEndsAt.getTime() + PHASE_EXTEND_STEP_SEC * 1000,
  );

  const ok = await prisma.$transaction(async (tx) => {
    // Re-check under this transaction: someone may have extended or the
    // phase may have ticked between the read above and now.
    const res = await tx.room.updateMany({
      where: {
        id: room.id,
        phase: room.phase,
        phaseEndsAt: room.phaseEndsAt,
        extendedSec: room.extendedSec,
      },
      data: {
        phaseEndsAt: newEndsAt,
        extendedSec: { increment: PHASE_EXTEND_STEP_SEC },
      },
    });
    if (res.count === 0) return false;

    await postSystemMessage(
      room.id,
      `Host extended phase by ${PHASE_EXTEND_STEP_SEC / 60} minutes.`,
      tx,
    );
    return true;
  });

  if (!ok) {
    return NextResponse.json({ error: "phase changed, retry" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    phaseEndsAt: newEndsAt.toISOString(),
    extendedSec: room.extendedSec + PHASE_EXTEND_STEP_SEC,
  });
}
