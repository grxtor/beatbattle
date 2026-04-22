import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Return high-XP users who are not yet friends
 * and not the current user, as "suggested".
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const me = session.user.id;

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: me }, { addresseeId: me }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const excludeIds = new Set<string>([me]);
  for (const f of friendships) {
    excludeIds.add(f.requesterId);
    excludeIds.add(f.addresseeId);
  }

  const suggestions = await prisma.user.findMany({
    where: {
      id: { notIn: [...excludeIds] },
      discoverable: true,
      acceptFriendRequests: true,
    },
    orderBy: { xp: "desc" },
    take: 6,
    select: { username: true, initials: true, level: true },
  });

  return NextResponse.json({ suggestions });
}
