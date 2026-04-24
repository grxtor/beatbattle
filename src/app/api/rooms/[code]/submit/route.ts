import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Legacy no-audio submit endpoint.
 *
 * Real submissions must go through `/api/rooms/[code]/track` so the server
 * only creates Track rows after validating and storing an audio file.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/submit">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = await rateLimit(`submit:${session.user.id}`, RATE_LIMITS.submitTrack);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  await ctx.params;
  return NextResponse.json(
    { error: "upload an audio file to submit a track" },
    { status: 410 },
  );
}
