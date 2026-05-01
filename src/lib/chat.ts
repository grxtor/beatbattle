import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Username of the seed-provisioned user we attribute system messages to.
 * The client differentiates these from real chat by `user.username === "system"`.
 *
 * RoomMessage.userId is a FK so we can't use a sentinel string id; instead we
 * resolve the system user's id once and cache it (the row never moves).
 */
const SYSTEM_USERNAME = "system";

let cachedSystemUserId: string | null = null;

/**
 * Find the system user id, caching it in-process. Falls back gracefully if
 * the seed hasn't been run — we just no-op (system messages are best-effort
 * UX, never load-bearing).
 */
async function getSystemUserId(
  client: Prisma.TransactionClient | typeof prisma,
): Promise<string | null> {
  if (cachedSystemUserId) return cachedSystemUserId;
  const sys = await client.user.findUnique({
    where: { username: SYSTEM_USERNAME },
    select: { id: true },
  });
  if (sys) {
    cachedSystemUserId = sys.id;
    return sys.id;
  }
  return null;
}

/**
 * Post a system message into a room's chat.
 *
 * Use the optional `tx` parameter when called inside a Prisma transaction —
 * for example from `tickPhase` so the message is part of the same atomic
 * advance and a rolled-back phase change doesn't leak a stray announcement.
 *
 * Best-effort: if the system user is missing (e.g. fresh DB without seed) we
 * log and return without throwing. Chat decoration must never break the
 * caller's primary flow.
 */
export async function postSystemMessage(
  roomId: string,
  body: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  try {
    const userId = await getSystemUserId(client);
    if (!userId) {
      console.warn(
        "[chat] system user missing; skipping system message:",
        body,
      );
      return;
    }
    // Hard cap at the column limit (varchar(2000)) to avoid surprise truncates.
    const safe = body.length > 2000 ? body.slice(0, 2000) : body;
    await client.roomMessage.create({
      data: { roomId, userId, body: safe },
    });
  } catch (err) {
    console.error("[chat] postSystemMessage failed", err);
  }
}

export const SYSTEM_MESSAGE_USERNAME = SYSTEM_USERNAME;
