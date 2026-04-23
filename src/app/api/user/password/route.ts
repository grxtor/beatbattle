import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "at least 6 characters").max(72),
});

/**
 * Change password. Requires the current password so a stolen session cookie
 * can't lock the real owner out.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const rl = await rateLimit(`pw:${session.user.id}`, RATE_LIMITS.passwordChange);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    // OAuth-only account with no local password set.
    return NextResponse.json(
      { error: "no password set for this account" },
      { status: 400 },
    );
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "current password is wrong" }, { status: 400 });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json({ error: "new password must differ" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      sessionVersion: { increment: 1 },
    },
  });
  await unstable_update({ authenticatedAt: Date.now() });

  return NextResponse.json({ ok: true });
}
