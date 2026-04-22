import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const postSchema = z.object({
  body: z.string().min(1).max(2000),
});

const HISTORY_LIMIT = 200;

/**
 * Send a chat message into a room.
 *
 * Only members of the room (including terminal RESULTS/CANCELLED so post-battle
 * banter still works) may post. Rate-limited per user.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/chat">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const rl = await rateLimit(`chat:${session.user.id}`, RATE_LIMITS.chatSend);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid message" }, { status: 400 });
  }
  const body = parsed.data.body.trim();
  if (body.length === 0) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
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

  const message = await prisma.roomMessage.create({
    data: {
      roomId: room.id,
      userId: session.user.id,
      body,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, username: true, initials: true } },
    },
  });

  return NextResponse.json({ ok: true, message });
}

/**
 * Tail recent messages.
 *
 * Clients pass `?since=<iso-ts>` to fetch anything after the last message they
 * already have. Without `since`, the endpoint returns the last `HISTORY_LIMIT`.
 * Non-members are rejected — we don't want the chat surface leaking to
 * drive-by pollers who guessed the room code.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/chat">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
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

  const sinceRaw = request.nextUrl.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const messages = await prisma.roomMessage.findMany({
    where: {
      roomId: room.id,
      ...(validSince ? { createdAt: { gt: validSince } } : {}),
    },
    orderBy: { createdAt: validSince ? "asc" : "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, username: true, initials: true } },
    },
  });

  // When there's no since-cursor we fetch DESC for tail trimming, then flip
  // back to chronological order for the client.
  const ordered = validSince ? messages : [...messages].reverse();
  return NextResponse.json({ messages: ordered });
}
