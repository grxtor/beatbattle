import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  acceptFriendRequests: z.boolean().optional(),
  showOnLeaderboard: z.boolean().optional(),
  discoverable: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = await rateLimit(`userwrite:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true },
  });
  return NextResponse.json({ ok: true });
}
