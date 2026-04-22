import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  username: z.string().min(2).max(32),
});

/**
 * Send a friend request.
 *
 * To reduce user enumeration we fold several "doesn't exist / won't accept /
 * already blocked" outcomes into the same generic response. Concrete states
 * the requester *can* see ("already friends", "request pending") are kept so
 * the UI stays useful — those facts aren't secret once a relationship exists.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const limit = await rateLimit(`friendreq:${session.user.id}`, RATE_LIMITS.friendRequest);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }

  const target = parsed.data.username.toLowerCase().trim();
  const me = session.user.id;

  const user = await prisma.user.findUnique({
    where: { username: target },
    select: { id: true, username: true, acceptFriendRequests: true },
  });
  if (!user) {
    return NextResponse.json({ error: "could not send request" }, { status: 400 });
  }
  if (user.id === me) {
    return NextResponse.json({ error: "can't friend yourself" }, { status: 400 });
  }
  if (!user.acceptFriendRequests) {
    return NextResponse.json({ error: "could not send request" }, { status: 400 });
  }

  try {
    const friendship = await prisma.$transaction(async (tx) => {
      // Look for any relationship in either direction under a tx so two
      // requesters can't both insert "PENDING" rows for the same pair.
      const existing = await tx.friendship.findFirst({
        where: {
          OR: [
            { requesterId: me, addresseeId: user.id },
            { requesterId: user.id, addresseeId: me },
          ],
        },
        select: { id: true, status: true, requesterId: true },
      });

      if (existing) {
        if (existing.status === "ACCEPTED") throw new AlreadyFriendsError();
        if (existing.status === "BLOCKED") throw new BlockedError();
        if (existing.status === "PENDING") {
          // If the *other* party has a pending request to us, accept it.
          if (existing.requesterId !== me) {
            const updated = await tx.friendship.update({
              where: { id: existing.id },
              data: { status: "ACCEPTED" },
            });
            return { friendship: updated, autoAccepted: true };
          }
          throw new PendingError();
        }
      }

      const fresh = await tx.friendship.create({
        data: { requesterId: me, addresseeId: user.id, status: "PENDING" },
      });
      return { friendship: fresh, autoAccepted: false };
    });

    if (friendship.autoAccepted) {
      // The other user already asked; just tell them it's accepted.
      const requester = await prisma.user.findUniqueOrThrow({
        where: { id: me },
        select: { username: true },
      });
      await createNotification({
        userId: user.id,
        type: "FRIEND",
        message: `**@${requester.username}** accepted your friend request`,
      }).catch((err) => console.error("[friend-request] notify", err));
      return NextResponse.json({ ok: true, friendship: friendship.friendship, accepted: true });
    }

    const requester = await prisma.user.findUniqueOrThrow({
      where: { id: me },
      select: { username: true },
    });
    await createNotification({
      userId: user.id,
      type: "FRIEND",
      message: `**@${requester.username}** sent you a friend request`,
      actionPrimary: "ACCEPT",
      actionSecondary: "DECLINE",
      actionPayload: { friendshipId: friendship.friendship.id },
    }).catch((err) => console.error("[friend-request] notify", err));

    return NextResponse.json(
      { ok: true, friendship: friendship.friendship },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AlreadyFriendsError) {
      return NextResponse.json({ error: "already friends" }, { status: 409 });
    }
    if (err instanceof PendingError) {
      return NextResponse.json({ error: "request already pending" }, { status: 409 });
    }
    if (err instanceof BlockedError) {
      return NextResponse.json({ error: "could not send request" }, { status: 400 });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Another tx raced us to create the row in the same direction.
      return NextResponse.json({ error: "request already pending" }, { status: 409 });
    }
    console.error("[friend-request]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

class AlreadyFriendsError extends Error {}
class PendingError extends Error {}
class BlockedError extends Error {}
