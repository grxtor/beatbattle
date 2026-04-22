import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/notifications/[id]/read">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = rateLimit(`notif:${session.user.id}`, RATE_LIMITS.notificationRead);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const { id } = await ctx.params;

  const n = await prisma.notification.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!n || n.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.notification.update({
    where: { id },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
