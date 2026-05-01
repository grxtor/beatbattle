import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { postSystemMessage } from "@/lib/chat";
import { MEDIA_ROOT, assertWithinMediaRoot } from "@/lib/media";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  userId: z.string().min(1),
});

/**
 * Host-only: remove a player from the room.
 *
 * - Hosts can't kick themselves (they should `leave` instead so the
 *   successor flow runs).
 * - Hosts can't kick their own host row (defense-in-depth — the same check
 *   plus the `isHost` filter on delete).
 * - If the kicked user already submitted a Track, the row is deleted so
 *   they don't continue to score in voting/settlement, and the audio file
 *   is best-effort unlinked from disk.
 * - System message announces the kick in chat.
 *
 * Idempotent: kicking an already-removed user returns 200 with notIn=true.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/kick">,
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
  const targetUserId = parsed.data.userId;

  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: "cannot kick yourself" }, { status: 400 });
  }

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: { id: true, hostId: true },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "not host" }, { status: 403 });
  }
  if (room.hostId === targetUserId) {
    return NextResponse.json({ error: "cannot kick host" }, { status: 400 });
  }

  // Capture the kicked user's track URL (if any) BEFORE the transaction so
  // we have a path to unlink after the DB is updated. Using a separate read
  // is fine — the DB-side delete is the source of truth.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;

    const target = await tx.roomPlayer.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: targetUserId } },
      select: { id: true, isHost: true, user: { select: { username: true } } },
    });
    if (!target) return { notIn: true as const };
    if (target.isHost) {
      throw new Error("CANNOT_KICK_HOST");
    }

    const track = await tx.track.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: targetUserId } },
      select: { id: true, audioUrl: true },
    });

    await tx.roomPlayer.delete({ where: { id: target.id } });
    if (track) {
      await tx.track.delete({ where: { id: track.id } });
    }

    await postSystemMessage(
      room.id,
      `@${target.user.username} was kicked by host.`,
      tx,
    );

    return { ok: true as const, removedTrackUrl: track?.audioUrl ?? null };
  }).catch((err) => {
    if (err instanceof Error && err.message === "CANNOT_KICK_HOST") {
      return { hostBlocked: true as const };
    }
    throw err;
  });

  if ("hostBlocked" in result) {
    return NextResponse.json({ error: "cannot kick host" }, { status: 400 });
  }
  if ("notIn" in result) {
    return NextResponse.json({ ok: true, notIn: true });
  }

  if (result.removedTrackUrl) {
    void unlinkPublicUrl(result.removedTrackUrl).catch((err) =>
      console.error("[kick] unlink failed", err),
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Translate a public media URL back to a disk path under MEDIA_ROOT and
 * unlink it. Mirrors the helper in /track route — we keep it inline here so
 * the dependency graph stays simple.
 */
async function unlinkPublicUrl(publicUrl: string): Promise<void> {
  const idx = publicUrl.indexOf("/tracks/");
  if (idx < 0) return;
  const sub = publicUrl.slice(idx + 1);
  const abs = path.join(MEDIA_ROOT, sub);
  try {
    assertWithinMediaRoot(abs);
  } catch {
    return;
  }
  await fs.unlink(abs).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  });
}
