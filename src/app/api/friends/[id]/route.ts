import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/** Unfriend — either party may call this. */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/friends/[id]">,
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
    select: { id: true, requesterId: true, addresseeId: true },
  });
  if (!friendship) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (
    friendship.requesterId !== session.user.id &&
    friendship.addresseeId !== session.user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.friendship.delete({ where: { id: friendship.id } });
  return NextResponse.json({ ok: true });
}
