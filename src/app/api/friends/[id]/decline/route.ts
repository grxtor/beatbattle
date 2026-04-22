import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/friends/[id]/decline">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = rateLimit(`frmut:${session.user.id}`, RATE_LIMITS.friendshipWrite);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const { id } = await ctx.params;

  const friendship = await prisma.friendship.findUnique({
    where: { id },
    select: { id: true, addresseeId: true, status: true },
  });
  if (!friendship) {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }
  if (friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (friendship.status !== "PENDING") {
    return NextResponse.json({ error: "not a pending request" }, { status: 409 });
  }

  await prisma.friendship.delete({ where: { id: friendship.id } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/friends/[id]/decline">,
) {
  return POST(_req, ctx);
}
