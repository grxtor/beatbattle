import "server-only";
import type { Prisma, RoomGenre } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Badges to check after a battle completes.
 * Returns the list of newly-awarded badge codes.
 */
export async function evaluateBadgesOnBattleEnd(
  tx: TxClient,
  ctx: { userId: string; roomGenre: RoomGenre; place: number; trackScore: number },
): Promise<string[]> {
  const awarded: string[] = [];

  const [
    battleCount,
    winCount,
    genreWinCount,
    insaneReceivedCount,
    existingBadgeCodes,
  ] = await Promise.all([
    tx.battleResult.count({ where: { userId: ctx.userId } }),
    tx.battleResult.count({ where: { userId: ctx.userId, place: 1 } }),
    tx.battleResult.count({
      where: {
        userId: ctx.userId,
        place: 1,
        room: { genre: ctx.roomGenre },
      },
    }),
    tx.vote.count({
      where: {
        rating: "INSANE",
        track: { userId: ctx.userId },
      },
    }),
    tx.userBadge
      .findMany({
        where: { userId: ctx.userId },
        include: { badge: { select: { code: true } } },
      })
      .then((rows) => new Set(rows.map((r) => r.badge.code))),
  ]);

  const toAward: string[] = [];

  if (ctx.place === 1 && !existingBadgeCodes.has("FIRST_WIN")) toAward.push("FIRST_WIN");
  if (battleCount >= 10 && !existingBadgeCodes.has("BATTLES_10")) toAward.push("BATTLES_10");
  if (battleCount >= 50 && !existingBadgeCodes.has("BATTLES_50")) toAward.push("BATTLES_50");
  if (ctx.roomGenre === "TRAP" && genreWinCount >= 5 && !existingBadgeCodes.has("TRAP_MASTER")) toAward.push("TRAP_MASTER");
  if (ctx.roomGenre === "LOFI" && genreWinCount >= 3 && !existingBadgeCodes.has("LOFI_FLIP")) toAward.push("LOFI_FLIP");
  if (insaneReceivedCount >= 10 && !existingBadgeCodes.has("INSANE_10")) toAward.push("INSANE_10");
  if (winCount >= 7 && !existingBadgeCodes.has("STREAK_WEEK")) toAward.push("STREAK_WEEK");

  for (const code of toAward) {
    const badge = await tx.badge.findUnique({ where: { code } });
    if (!badge) continue;
    try {
      await tx.userBadge.create({
        data: { userId: ctx.userId, badgeId: badge.id },
      });
      awarded.push(code);
    } catch {
      // race: same badge awarded by another transaction → ignore
    }
  }

  return awarded;
}
