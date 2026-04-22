import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  password: z.string().optional(),
  confirm: z.string().min(1),
});

/**
 * Delete the current user's account.
 *
 * Safety:
 *  - Requires `confirm: "DELETE"` in the body so a stray DELETE can't nuke.
 *  - Credentials accounts must also pass `password` for re-auth.
 *  - OAuth-only accounts (no passwordHash) skip password check.
 *  - Rate-limited hard — 3/hour.
 *
 * Cascade behavior:
 *  - Hosted rooms: transfer host to the earliest other player; if no one
 *    else is in the room, the room is deleted (taking tracks/players/results
 *    with it via Prisma `onDelete: Cascade`).
 *  - Everything else owned by the user (RoomPlayer, Track, Vote, UserPack,
 *    UserBadge, Friendship, Notification, Account) is already cascade-wired
 *    in schema, so `user.delete` finishes the job.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const me = session.user.id;

  const rl = rateLimit(`del:${me}`, RATE_LIMITS.accountDelete);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (parsed.data.confirm !== "DELETE") {
    return NextResponse.json({ error: "confirm phrase required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: me },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  if (user.passwordHash) {
    if (!parsed.data.password) {
      return NextResponse.json({ error: "password required" }, { status: 400 });
    }
    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "password is wrong" }, { status: 400 });
    }
  }

  const MAX_TRANSFER_ATTEMPTS = 3;

  await prisma.$transaction(async (tx) => {
    // IDs only; successor is re-read under the per-room lock below so another
    // client leaving mid-transaction doesn't hand us a stale winner.
    const hostedIds = await tx.room.findMany({
      where: { hostId: me },
      select: { id: true },
    });

    for (const { id: roomId } of hostedIds) {
      let handled = false;
      for (let attempt = 0; attempt < MAX_TRANSFER_ATTEMPTS; attempt++) {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`;

        const successor = await tx.roomPlayer.findFirst({
          where: { roomId, userId: { not: me } },
          orderBy: { joinedAt: "asc" },
          select: { id: true, userId: true },
        });

        if (!successor) {
          await tx.room.delete({ where: { id: roomId } });
          handled = true;
          break;
        }

        try {
          await tx.roomPlayer.update({
            where: { id: successor.id },
            data: { isHost: true, isReady: true },
          });
          await tx.room.update({
            where: { id: roomId },
            data: { hostId: successor.userId },
          });
          handled = true;
          break;
        } catch (err) {
          // P2025 = record vanished between findFirst and update (successor left).
          // Retry with a fresh successor under a fresh lock read.
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2025"
          ) {
            continue;
          }
          throw err;
        }
      }
      if (!handled) {
        // Exceeded retry budget — give up and cancel the room so we don't
        // leave an inconsistent host reference behind.
        await tx.room.delete({ where: { id: roomId } });
      }
    }

    await tx.user.delete({ where: { id: me } });
  });

  await signOut({ redirect: false });
  return NextResponse.json({ ok: true });
}
