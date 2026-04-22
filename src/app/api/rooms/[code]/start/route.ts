import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startBattle } from "@/lib/battle";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/rooms/[code]/start">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = rateLimit(`roommut:${session.user.id}`, RATE_LIMITS.roomMutation);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const { code: rawCode } = await ctx.params;
  const room = await prisma.room.findUnique({
    where: { code: rawCode.toUpperCase() },
    select: { id: true },
  });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });

  try {
    const updated = await startBattle(room.id, session.user.id);
    return NextResponse.json({ ok: true, phase: updated.phase });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "err";
    if (msg === "NOT_HOST") return NextResponse.json({ error: "not host" }, { status: 403 });
    if (msg === "ALREADY_STARTED") return NextResponse.json({ error: "already started" }, { status: 409 });
    console.error("[start]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
