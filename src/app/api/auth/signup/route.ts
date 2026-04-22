import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  RATE_LIMITS,
  clientIpFrom,
  rateLimit,
  tooManyRequests,
} from "@/lib/rateLimit";

const signupSchema = z.object({
  username: z
    .string()
    .min(3, "at least 3 characters")
    .max(20, "at most 20 characters")
    .regex(/^[a-z0-9_]+$/i, "letters, digits, underscore only"),
  password: z.string().min(6, "at least 6 characters").max(72),
});

function initialsOf(username: string) {
  const u = username.toUpperCase();
  return (u[0] + (u[1] ?? u[0])).slice(0, 3);
}

export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers);
  const limit = rateLimit(`signup:${ip}`, RATE_LIMITS.signup);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid input" },
      { status: 400 },
    );
  }

  const username = parsed.data.username.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        initials: initialsOf(username),
        passwordHash,
        level: 1,
        xp: 0,
        tier: "BRONZE III",
        currency: 100,
      },
      select: { id: true, username: true },
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "username is taken" },
        { status: 409 },
      );
    }
    console.error("[signup]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
