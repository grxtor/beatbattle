import { NextResponse, type NextRequest } from "next/server";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isRecentAuth, reauthRequiredResponse } from "@/lib/sessionSecurity";

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/user/linked/[provider]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  if (!isRecentAuth(session.authenticatedAt)) {
    return reauthRequiredResponse();
  }

  const rl = await rateLimit(`userwrite:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const { provider } = await ctx.params;

  // Block unlinking the only remaining sign-in method. Otherwise an OAuth-only
  // account can permanently lock itself out.
  const [user, otherAccounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    }),
    prisma.account.count({
      where: { userId: session.user.id, provider: { not: provider } },
    }),
  ]);
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  if (!user.passwordHash && otherAccounts === 0) {
    return NextResponse.json(
      {
        error:
          "can't unlink — this is your only sign-in method. Set a password first.",
      },
      { status: 409 },
    );
  }

  const deleted = await prisma.account.deleteMany({
    where: { userId: session.user.id, provider },
  });

  if (deleted.count > 0) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    await unstable_update({ authenticatedAt: Date.now() });
  }

  return NextResponse.json({ ok: true });
}
