import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  username: z.string().min(2).max(32),
});

const ACTIVE_PHASES = ["LOBBY", "REVEAL", "PRODUCTION", "UPLOAD", "VOTING"] as const;

/**
 * POST /api/rooms/[code]/invite
 *
 * Invites a friend to the room. Rules:
 *  - Requester must be a player in the room (and room in an active phase).
 *  - Target must be an ACCEPTED friend of the requester (cuts invite spam).
 *  - Target must not already be in the room.
 *  - Rate-limited per inviter.
 *
 * Creates an INVITE notification carrying { roomCode } in actionPayload so the
 * notification modal's JOIN button navigates correctly.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[code]/invite">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const me = session.user.id;

  const limit = await rateLimit(`roominvite:${me}`, RATE_LIMITS.roomInvite);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const { code } = await context.params;
  const codeUpper = code.toUpperCase();

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }
  const targetUsername = parsed.data.username.toLowerCase().trim();

  const room = await prisma.room.findUnique({
    where: { code: codeUpper },
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      players: { select: { userId: true } },
    },
  });
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (!ACTIVE_PHASES.includes(room.phase as (typeof ACTIVE_PHASES)[number])) {
    return NextResponse.json({ error: "room not active" }, { status: 400 });
  }

  const amIIn = room.players.some((p) => p.userId === me);
  if (!amIIn) {
    return NextResponse.json({ error: "not in this room" }, { status: 403 });
  }

  // Generic failure keeps us from leaking "which username exists", "who are your
  // friends", or "who else is in this room" to a probing caller. Specific errors
  // above this point are about the INVITER's own room state, which they know.
  const GENERIC = NextResponse.json(
    { error: "could not send invite" },
    { status: 400 },
  );

  const target = await prisma.user.findUnique({
    where: { username: targetUsername },
    select: { id: true, username: true },
  });
  if (!target) return GENERIC;
  if (target.id === me) return GENERIC;
  if (room.players.some((p) => p.userId === target.id)) return GENERIC;

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: me, addresseeId: target.id },
        { requesterId: target.id, addresseeId: me },
      ],
    },
    select: { id: true },
  });
  if (!friendship) return GENERIC;

  const requester = await prisma.user.findUniqueOrThrow({
    where: { id: me },
    select: { username: true },
  });

  try {
    await createNotification({
      userId: target.id,
      type: "INVITE",
      message: `**@${requester.username}** invited you to **${room.code}**`,
      actionPrimary: "JOIN",
      actionSecondary: "DISMISS",
      actionPayload: { roomCode: room.code },
    });
  } catch (err) {
    console.error("[room-invite] notify", err);
    return NextResponse.json({ error: "could not send invite" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
