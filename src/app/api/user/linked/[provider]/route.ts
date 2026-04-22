import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/user/linked/[provider]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = rateLimit(`userwrite:${session.user.id}`, RATE_LIMITS.profileWrite);
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

  await prisma.account.deleteMany({
    where: { userId: session.user.id, provider },
  });
  return NextResponse.json({ ok: true });
}
