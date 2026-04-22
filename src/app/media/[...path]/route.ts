import { NextResponse, type NextRequest } from "next/server";
import { contentTypeFor, readMediaFile } from "@/lib/media";

/**
 * Dev-mode media fallback.
 *
 * In production the Debian host's nginx aliases `/media/` → `MEDIA_ROOT`, so
 * this route never gets hit. In development we serve files from the same
 * directory via Next.js so `pnpm dev` works with zero extra config.
 *
 * Read-only; no write surface is exposed. Traversal is blocked in
 * `readMediaFile`.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/media/[...path]">,
) {
  const { path: parts } = await ctx.params;
  const relPath = parts.join("/");

  const file = await readMediaFile(relPath);
  if (!file) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(file.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(file.ext),
      "Content-Length": String(file.buffer.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
