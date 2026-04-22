import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Disk-backed media storage.
 *
 * Layout:
 *   <MEDIA_ROOT>/tracks/<roomId>/<trackId>.<ext>
 *   <MEDIA_ROOT>/samples/<packCode>/<sampleName>.<ext>
 *
 * In production nginx should alias `MEDIA_PUBLIC_BASE` → `<MEDIA_ROOT>` so
 * audio bytes never touch Node. In dev we also expose a Next route handler
 * at `/media/...` as a fallback so things work with zero extra config.
 */

export const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT ?? "./media");
export const MEDIA_PUBLIC_BASE = process.env.MEDIA_PUBLIC_BASE ?? "/media";

const MAX_TRACK_BYTES = 30 * 1024 * 1024; // 30 MB

export const ALLOWED_AUDIO = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/vorbis": "ogg",
} as const;

export type AudioMime = keyof typeof ALLOWED_AUDIO;

export function extensionFor(mime: string): string | null {
  return ALLOWED_AUDIO[mime as AudioMime] ?? null;
}

export function contentTypeFor(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "mp3") return "audio/mpeg";
  if (e === "wav") return "audio/wav";
  if (e === "ogg") return "audio/ogg";
  return "application/octet-stream";
}

/**
 * Verify magic bytes so a client can't sneak in a non-audio file by setting
 * the Content-Type header to `audio/mpeg`. This won't catch sophisticated
 * polyglots but stops casual abuse.
 */
export function sniffAudio(buf: Buffer): "mp3" | "wav" | "ogg" | null {
  if (buf.length < 4) return null;

  // WAV: "RIFF" + 4 bytes size + "WAVE"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) {
    return "wav";
  }

  // OGG: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return "ogg";
  }

  // MP3 with ID3v2 tag: "ID3"
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return "mp3";

  // MP3 raw frame sync: 0xFFE0-0xFFFF (first 11 bits all set)
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return "mp3";

  return null;
}

export function assertWithinMediaRoot(absPath: string): void {
  const resolved = path.resolve(absPath);
  const rootWithSep = MEDIA_ROOT.endsWith(path.sep) ? MEDIA_ROOT : MEDIA_ROOT + path.sep;
  if (resolved !== MEDIA_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error("media path escapes MEDIA_ROOT");
  }
}

/**
 * Write a track buffer to disk. Returns the public URL the client should use.
 *
 * If an existing track file is at the same path it's overwritten — a user
 * re-submitting replaces their prior upload. We also add a short random
 * suffix so the URL changes per upload (busts CDN/browser caches).
 */
export async function writeTrackFile(params: {
  roomId: string;
  trackId: string;
  buffer: Buffer;
  mime: string;
}): Promise<{ publicUrl: string; absPath: string; size: number; ext: string }> {
  if (params.buffer.byteLength > MAX_TRACK_BYTES) {
    throw new TrackTooLargeError(params.buffer.byteLength);
  }
  const sniffed = sniffAudio(params.buffer);
  const mimeExt = extensionFor(params.mime);
  if (!sniffed || !mimeExt || sniffed !== mimeExt) {
    throw new UnsupportedAudioError(params.mime, sniffed);
  }

  const dir = path.join(MEDIA_ROOT, "tracks", params.roomId);
  assertWithinMediaRoot(dir);
  await fs.mkdir(dir, { recursive: true });

  const suffix = crypto.randomBytes(4).toString("hex");
  const filename = `${params.trackId}.${suffix}.${sniffed}`;
  const absPath = path.join(dir, filename);
  assertWithinMediaRoot(absPath);

  await fs.writeFile(absPath, params.buffer);

  const publicUrl = `${MEDIA_PUBLIC_BASE}/tracks/${params.roomId}/${filename}`;
  return { publicUrl, absPath, size: params.buffer.byteLength, ext: sniffed };
}

/** Read a file from MEDIA_ROOT by its relative sub-path (used by dev route handler). */
export async function readMediaFile(relPath: string): Promise<{
  buffer: Buffer;
  ext: string;
} | null> {
  // Normalize + reject any traversal attempts before constructing the abs path.
  const normalized = path
    .normalize("/" + relPath)
    .replace(/^[/\\]+/, "");
  if (normalized.includes("..")) return null;

  const absPath = path.join(MEDIA_ROOT, normalized);
  try {
    assertWithinMediaRoot(absPath);
  } catch {
    return null;
  }

  try {
    const buffer = await fs.readFile(absPath);
    const ext = path.extname(absPath).slice(1).toLowerCase();
    return { buffer, ext };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export class TrackTooLargeError extends Error {
  constructor(public bytes: number) {
    super(`track exceeds max size: ${bytes} bytes > ${MAX_TRACK_BYTES}`);
    this.name = "TrackTooLargeError";
  }
}

export class UnsupportedAudioError extends Error {
  constructor(public mime: string, public detected: string | null) {
    super(
      `unsupported audio: mime=${mime}, detected=${detected ?? "none"}`,
    );
    this.name = "UnsupportedAudioError";
  }
}

export const MEDIA_LIMITS = {
  maxTrackBytes: MAX_TRACK_BYTES,
} as const;
