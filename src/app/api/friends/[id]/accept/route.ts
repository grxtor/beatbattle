import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/friends/[id]/accept">,
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
    select: { id: true, requesterId: true, addresseeId: true, status: true },
  });
  if (!friendship) {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }
  // sadece addressee kabul edebilir
  if (friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (friendship.status !== "PENDING") {
    return NextResponse.json({ error: "not a pending request" }, { status: 409 });
  }

  const [updated, me] = await prisma.$transaction([
    prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: "ACCEPTED" },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { username: true },
    }),
  ]);

  // requester'a kabul bildirimi
  await createNotification({
    userId: friendship.requesterId,
    type: "FRIEND",
    message: `**@${me.username}** accepted your friend request`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, friendship: updated });
}
