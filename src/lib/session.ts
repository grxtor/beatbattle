import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Dedupe DB calls across server components within the same request via react cache. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      initials: true,
      email: true,
      bio: true,
      level: true,
      xp: true,
      wins: true,
      streak: true,
      currency: true,
      tier: true,
      online: true,
      acceptFriendRequests: true,
      showOnLeaderboard: true,
      discoverable: true,
    },
  });
});

/** For pages that require auth: redirect to /login when missing. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
