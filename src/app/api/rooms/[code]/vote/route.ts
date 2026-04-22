import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const RATINGS = ["INSANE", "VERY_GOOD", "GOOD", "OKAY", "BAD", "VERY_BAD"] as const;

const schema = z.object({
  trackId: z.string().min(1),
  rating: z.enum(RATINGS),
  /** When true the vote is locked and can no longer be changed. */
  lock: z.boolean().optional().default(false),
});

/**
 * Cast or update a vote. Votes are mutable until the voter locks them
 * (either by re-selecting the same rating or by sending `lock: true`).
 * Once `lockedAt` is set the server rejects further changes.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/vote">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = rateLimit(`vote:${session.user.id}`, RATE_LIMITS.voteCast);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

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
  if (room.phase !== "VOTING") {
    return NextResponse.json({ error: "voting not open" }, { status: 409 });
  }

  const track = await prisma.track.findUnique({
    where: { id: parsed.data.trackId },
    select: { id: true, userId: true, roomId: true },
  });
  if (!track || track.roomId !== room.id) {
    return NextResponse.json({ error: "track not in this room" }, { status: 400 });
  }
  if (track.userId === session.user.id) {
    return NextResponse.json({ error: "cannot vote your own track" }, { status: 400 });
  }

  // Race-safe write:
  //  - If the row doesn't exist, `create` is a single insert (unique index
  //    serializes duplicates — the loser gets P2002 and retries the update path).
  //  - If it exists, `updateMany` includes `lockedAt: null` in its WHERE so a
  //    just-locked vote can't be overwritten by a concurrent request.
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.vote.findUnique({
        where: {
          trackId_voterId: { trackId: track.id, voterId: session.user!.id },
        },
        select: { id: true, rating: true, lockedAt: true },
      });

      if (existing?.lockedAt) throw new VoteLockedError();

      const shouldLock =
        parsed.data.lock ||
        (existing != null && existing.rating === parsed.data.rating);
      const lockedAt = shouldLock ? new Date() : null;

      if (existing) {
        const res = await tx.vote.updateMany({
          where: { id: existing.id, lockedAt: null },
          data: { rating: parsed.data.rating, lockedAt },
        });
        if (res.count === 0) throw new VoteLockedError();
        return { rating: parsed.data.rating, lockedAt };
      }

      const created = await tx.vote.create({
        data: {
          trackId: track.id,
          voterId: session.user!.id,
          rating: parsed.data.rating,
          lockedAt,
        },
        select: { rating: true, lockedAt: true },
      });
      return { rating: created.rating, lockedAt: created.lockedAt };
    });

    return NextResponse.json({
      ok: true,
      rating: saved.rating,
      locked: saved.lockedAt !== null,
    });
  } catch (err) {
    if (err instanceof VoteLockedError) {
      return NextResponse.json({ error: "vote is locked" }, { status: 409 });
    }
    throw err;
  }
}

class VoteLockedError extends Error {
  constructor() {
    super("vote is locked");
    this.name = "VoteLockedError";
  }
}
