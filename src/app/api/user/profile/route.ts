import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const schema = z.object({
  initials: z
    .string()
    .trim()
    .min(1, "at least 1 character")
    .max(3, "at most 3 characters")
    .regex(/^[A-Za-z0-9]+$/, "letters and digits only")
    .optional(),
  bio: z.string().max(200, "at most 200 characters").nullable().optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const rl = rateLimit(`userwrite:${session.user.id}`, RATE_LIMITS.profileWrite);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid" },
      { status: 400 },
    );
  }

  const data: { initials?: string; bio?: string | null } = {};
  if (parsed.data.initials !== undefined) {
    data.initials = parsed.data.initials.toUpperCase();
  }
  if (parsed.data.bio !== undefined) {
    const trimmed = parsed.data.bio?.trim() ?? null;
    data.bio = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, initials: true, bio: true },
  });

  return NextResponse.json({ ok: true, user });
}
