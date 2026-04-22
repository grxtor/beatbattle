import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import {
  MEDIA_LIMITS,
  MEDIA_ROOT,
  TrackTooLargeError,
  UnsupportedAudioError,
  assertWithinMediaRoot,
  writeTrackFile,
} from "@/lib/media";

/**
 * Upload the producer's finished track.
 *
 * Content-Type: multipart/form-data with a single `file` field.
 *
 * Rules:
 *  - Auth + in-room required
 *  - Phase must be PRODUCTION or UPLOAD (same as /submit)
 *  - Max 30 MB, mp3/wav/ogg only (magic-byte sniffed)
 *  - Replaces any prior upload from this user in this room atomically
 *
 * Creates or updates the Track row with the new audioUrl. The old file on
 * disk is deleted after the DB row is updated so we don't orphan bytes.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/track">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const me = session.user.id;

  const rl = await rateLimit(`trackup:${me}`, RATE_LIMITS.trackUpload);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      phase: true,
      players: { where: { userId: me }, select: { id: true } },
    },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.players.length === 0) {
    return NextResponse.json({ error: "not in room" }, { status: 403 });
  }
  if (room.phase !== "PRODUCTION" && room.phase !== "UPLOAD") {
    return NextResponse.json({ error: "upload window closed" }, { status: 409 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MEDIA_LIMITS.maxTrackBytes) {
    return NextResponse.json(
      { error: `file too large (max ${MEDIA_LIMITS.maxTrackBytes} bytes)` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upsert first so we have a stable trackId for the filename.
  const track = await prisma.track.upsert({
    where: { roomId_userId: { roomId: room.id, userId: me } },
    update: {},
    create: { roomId: room.id, userId: me, audioUrl: null },
    select: { id: true, audioUrl: true },
  });

  let written;
  try {
    written = await writeTrackFile({
      roomId: room.id,
      trackId: track.id,
      buffer,
      mime: file.type,
    });
  } catch (err) {
    if (err instanceof TrackTooLargeError) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }
    if (err instanceof UnsupportedAudioError) {
      return NextResponse.json(
        { error: "unsupported audio format — mp3/wav/ogg only" },
        { status: 400 },
      );
    }
    console.error("[track] write failed", err);
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }

  // Swap audioUrl on the track row; only delete the previous file after the
  // DB is updated so a concurrent reader never sees a dead URL.
  const previousUrl = track.audioUrl;
  await prisma.track.update({
    where: { id: track.id },
    data: { audioUrl: written.publicUrl },
  });

  if (previousUrl && previousUrl !== written.publicUrl) {
    void unlinkPublicUrl(previousUrl).catch((err) =>
      console.error("[track] unlink previous failed", err),
    );
  }

  return NextResponse.json({
    ok: true,
    trackId: track.id,
    audioUrl: written.publicUrl,
    size: written.size,
  });
}

/** Translate a public media URL back to a disk path under MEDIA_ROOT. */
async function unlinkPublicUrl(publicUrl: string): Promise<void> {
  // Public URLs are `<MEDIA_PUBLIC_BASE>/tracks/<roomId>/<file>`. We want
  // just the sub-path after the base.
  const idx = publicUrl.indexOf("/tracks/");
  if (idx < 0) return;
  const sub = publicUrl.slice(idx + 1); // drop leading slash
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
