import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * Buy a pack — currency ↓, UserPack ↑, single transaction.
 *
 * Race-safe: the balance check lives inside a conditional `updateMany`
 * (`where: { currency: { gte: price } }`). Two concurrent buys cannot both
 * pass the check: the second `updateMany` sees `count === 0` and the
 * transaction rolls back before the `UserPack` row is created.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/shop/[id]/buy">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const limit = rateLimit(`buy:${session.user.id}`, RATE_LIMITS.shopBuy);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const { id: idRaw } = await ctx.params;
  const packId = Number(idRaw);
  if (!Number.isInteger(packId)) {
    return NextResponse.json({ error: "invalid pack" }, { status: 400 });
  }

  const pack = await prisma.shopPack.findUnique({ where: { id: packId } });
  if (!pack) return NextResponse.json({ error: "pack not found" }, { status: 404 });

  if (pack.unlockLvl) {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { level: true },
    });
    if (u.level < pack.unlockLvl) {
      return NextResponse.json(
        { error: `LVL ${pack.unlockLvl} required` },
        { status: 403 },
      );
    }
  }

  try {
    const { currency } = await prisma.$transaction(async (tx) => {
      const decremented = await tx.user.updateMany({
        where: { id: session.user!.id, currency: { gte: pack.price } },
        data: { currency: { decrement: pack.price } },
      });
      if (decremented.count === 0) {
        throw new InsufficientFundsError();
      }

      await tx.userPack.create({
        data: { userId: session.user!.id, packId: pack.id },
      });

      const me = await tx.user.findUniqueOrThrow({
        where: { id: session.user!.id },
        select: { currency: true },
      });
      return { currency: me.currency };
    });

    return NextResponse.json({
      ok: true,
      currency,
      pack: { id: pack.id, name: pack.name },
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return NextResponse.json({ error: "not enough coins" }, { status: 402 });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ error: "already owned" }, { status: 409 });
    }
    console.error("[shop/buy]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

class InsufficientFundsError extends Error {
  constructor() {
    super("insufficient funds");
    this.name = "InsufficientFundsError";
  }
}
