import { type NextRequest } from "next/server";
import JSZip from "jszip";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readMediaFile, MEDIA_PUBLIC_BASE } from "@/lib/media";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Bundle this room's 4 rolled samples into a ZIP for the producer to drop
 * straight into their DAW.
 *
 * Only room members can download — outsiders shouldn't peek at a private
 * room's sample set, and the endpoint is useless before `startBattle` rolls
 * the samples anyway.
 *
 * Compression is STORE (no deflate) because WAV/MP3/OGG are already encoded
 * and don't compress meaningfully; STORE keeps response time low.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/samples.zip">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("unauthorized", { status: 401 });
  }

  const { code: rawCode } = await ctx.params;
  const code = rawCode.toUpperCase();

  const room = await prisma.room.findUnique({
    where: { code },
    select: {
      id: true,
      phase: true,
      samples: true,
      players: {
        where: { userId: session.user.id },
        select: { id: true },
      },
    },
  });
  if (!room) return new Response("room not found", { status: 404 });
  if (room.players.length === 0) {
    return new Response("not a member of this room", { status: 403 });
  }

  const zipLimit = await rateLimit(
    `sampleszip:${session.user.id}:${room.id}`,
    RATE_LIMITS.samplesZip,
  );
  if (!zipLimit.ok) return tooManyRequests(zipLimit.retryAfter);

  const samples = Array.isArray(room.samples) ? (room.samples as Array<{
    name?: string;
    audioUrl?: string | null;
  }>) : [];

  const playable = samples.filter((s) => s.audioUrl);
  if (playable.length === 0) {
    return new Response("samples not ready yet", { status: 409 });
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const s of playable) {
    const rel = urlToRelPath(s.audioUrl!);
    if (!rel) continue;

    const file = await readMediaFile(rel);
    if (!file) continue;

    const base = `${sanitizeFilename(s.name ?? "sample")}.${file.ext}`;
    const name = uniqueName(base, usedNames);
    zip.file(name, file.buffer);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="battle-${code}-samples.zip"`,
      "content-length": buffer.byteLength.toString(),
      "cache-control": "private, no-store",
    },
  });
}

function urlToRelPath(audioUrl: string): string | null {
  const prefix = MEDIA_PUBLIC_BASE.endsWith("/")
    ? MEDIA_PUBLIC_BASE
    : MEDIA_PUBLIC_BASE + "/";
  if (!audioUrl.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(audioUrl.slice(prefix.length));
  } catch {
    return null;
  }
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._ -]+/g, "_").trim().slice(0, 60);
  return cleaned || "sample";
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (taken.has(`${stem}-${i}${ext}`)) i++;
  const final = `${stem}-${i}${ext}`;
  taken.add(final);
  return final;
}
