import "server-only";
import { prisma } from "@/lib/prisma";
import { onlineCutoff } from "@/lib/queries";

/**
 * How long a room can sit in LOBBY with zero active players before we
 * auto-cancel it. Keep this comfortably above the presence cutoff so we
 * don't kill rooms whose owners are just briefly switching tabs.
 */
const ABANDON_MIN = 10; // minutes

/**
 * A PRODUCTION / UPLOAD / VOTING room that never got completed (host left,
 * clocks passed) gets force-ended a bit more aggressively.
 */
const STUCK_MIN = 5;

// Module-level throttle: don't run more than once per 60s.
let lastRun = 0;

/**
 * Lazy cleanup: marks abandoned rooms as CANCELLED.
 * Called from getPublicRooms and /api/presence — opportunistic.
 */
export async function cleanupAbandonedRooms(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < 60_000) return;
  lastRun = now;

  const presenceCutoff = onlineCutoff();
  const abandonCutoff = new Date(now - ABANDON_MIN * 60_000);
  const stuckCutoff = new Date(now - STUCK_MIN * 60_000);

  try {
    // 1) LOBBY rooms older than ABANDON_MIN with no recent player presence.
    const staleLobbies = await prisma.room.findMany({
      where: {
        phase: "LOBBY",
        createdAt: { lte: abandonCutoff },
      },
      select: {
        id: true,
        players: {
          select: { user: { select: { lastSeenAt: true } } },
        },
      },
      take: 100,
    });

    const lobbyToCancel = staleLobbies
      .filter((r) => !r.players.some(
        (p) => p.user.lastSeenAt >= presenceCutoff,
      ))
      .map((r) => r.id);

    if (lobbyToCancel.length) {
      await prisma.room.updateMany({
        where: { id: { in: lobbyToCancel } },
        data: { phase: "CANCELLED", endedAt: new Date() },
      });
    }

    // 2) Rooms whose phaseEndsAt passed > STUCK_MIN ago and still aren't
    //    RESULTS/CANCELLED. These are rooms where the phase ticker never
    //    fired (no one polled) — just force-end them.
    await prisma.room.updateMany({
      where: {
        phase: { in: ["REVEAL", "PRODUCTION", "UPLOAD", "VOTING"] },
        phaseEndsAt: { not: null, lte: stuckCutoff },
      },
      data: { phase: "CANCELLED", endedAt: new Date() },
    });

    // 3) Ghost memberships: LOBBY-only. Remove non-host players who have
    //    been offline > ABANDON_MIN. The host is intentionally preserved —
    //    if only the host remains and they're a ghost, step 1 cancels the
    //    whole room on the next tick, keeping hostId / players consistent.
    //    (Mid-battle players are not pruned so their tracks can be scored.)
    await prisma.roomPlayer.deleteMany({
      where: {
        room: { phase: "LOBBY" },
        user: { lastSeenAt: { lt: abandonCutoff } },
        isHost: false,
      },
    });
  } catch (err) {
    // never throw from cleanup — it's best-effort
    console.error("[roomCleanup]", err);
  }
}
