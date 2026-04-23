import "server-only";
import type { Prisma, RoomGenre, RoomPhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rollSamples, placementsFor, awardForPlace, levelForXp, tierForXp, shuffle, VOTE_PARTICIPATION_XP, type SampleSet } from "@/lib/game";
import { createNotification } from "@/lib/notifications";
import { evaluateBadgesOnBattleEnd } from "@/lib/badges";

/**
 * Pick a playable, well-balanced 4-sample set for a battle.
 *
 * Every producer needs at least one kick and one snare to build a beat, so
 * those two categories are always present. The remaining two picks come
 * from 808s / claps / fx / percussion at random, so no two battles feel
 * identical.
 *
 * Category is parsed from the Sample's audio URL (`/media/samples/<dir>/…`),
 * since that's the directory layout `scanLibrary()` writes during seeding.
 * Any category that has no samples on disk is silently skipped, and any
 * shortfall is padded from the fantasy `SAMPLE_POOL` so unseeded/partially
 * seeded deployments still boot a battle.
 */
function categoryOf(audioUrl: string | null): string | null {
  if (!audioUrl) return null;
  const m = audioUrl.match(/\/samples\/([^/]+)\//);
  return m ? m[1].toLowerCase() : null;
}

async function pickBattleSamples(genre: RoomGenre, count = 4): Promise<SampleSet> {
  const genreFilter: Prisma.SampleWhereInput["pack"] =
    genre === "RANDOM" ? undefined : { genre: { in: [genre, "FX"] } };

  const rows = await prisma.sample.findMany({
    where: { audioUrl: { not: null }, pack: genreFilter },
    select: { name: true, duration: true, audioUrl: true },
    take: 800,
  });

  const byCat = new Map<string, typeof rows>();
  for (const r of rows) {
    const c = categoryOf(r.audioUrl);
    if (!c) continue;
    const bucket = byCat.get(c) ?? [];
    bucket.push(r);
    byCat.set(c, bucket);
  }

  const pickOne = (cat: string) => {
    const bucket = byCat.get(cat);
    if (!bucket || bucket.length === 0) return null;
    const idx = Math.floor(Math.random() * bucket.length);
    const [picked] = bucket.splice(idx, 1);
    return picked;
  };

  const picks: SampleSet = [];

  for (const required of ["kicks", "snares"]) {
    const one = pickOne(required);
    if (one) picks.push(one);
  }

  const extras = shuffle(["808s", "claps", "fx", "percussion"]);
  for (const cat of extras) {
    if (picks.length >= count) break;
    const one = pickOne(cat);
    if (one) picks.push(one);
  }

  // If some required category was missing on disk, backfill from anything
  // else we still have, then from the fantasy pool — battle must start.
  const flatLeft = shuffle([...byCat.values()].flat());
  while (picks.length < count && flatLeft.length > 0) {
    picks.push(flatLeft.shift()!);
  }
  if (picks.length < count) {
    const filler = rollSamples(genre, count - picks.length);
    picks.push(...filler);
  }
  return picks;
}

/**
 * Normal phase order (CANCELLED is a special state).
 * `null` duration means "terminal, do not advance".
 */
export const PHASE_ORDER: RoomPhase[] = [
  "LOBBY",
  "REVEAL",
  "PRODUCTION",
  "UPLOAD",
  "VOTING",
  "RESULTS",
];

/** Seconds per phase. LOBBY is open-ended, RESULTS is terminal. */
type DurationSource = { revealSec: number; uploadSec: number; votingSec: number; lengthMin: number };

export function durationForPhase(phase: RoomPhase, src: DurationSource): number | null {
  switch (phase) {
    case "REVEAL":     return src.revealSec;
    case "PRODUCTION": return src.lengthMin * 60;
    case "UPLOAD":     return src.uploadSec;
    case "VOTING":     return src.votingSec;
    default:           return null;
  }
}

export function nextPhase(p: RoomPhase): RoomPhase | null {
  const idx = PHASE_ORDER.indexOf(p);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

/**
 * Host starts the battle: LOBBY → REVEAL + roll 4 random samples.
 *
 * Race-safe: the transition is performed with `updateMany` where `phase='LOBBY'`,
 * so two concurrent starts can't both succeed and overwrite each other's
 * samples/startedAt. The loser gets ALREADY_STARTED.
 */
export async function startBattle(roomId: string, actorId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("ROOM_NOT_FOUND");
  if (room.hostId !== actorId) throw new Error("NOT_HOST");
  if (room.phase !== "LOBBY") throw new Error("ALREADY_STARTED");

  const samples = await pickBattleSamples(room.genre);
  const durationSec = durationForPhase("REVEAL", room)!;
  const phaseEndsAt = new Date(Date.now() + durationSec * 1000);

  const res = await prisma.room.updateMany({
    where: { id: room.id, phase: "LOBBY" },
    data: {
      phase: "REVEAL",
      phaseEndsAt,
      samples: samples as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });
  if (res.count === 0) throw new Error("ALREADY_STARTED");

  return prisma.room.findUniqueOrThrow({ where: { id: room.id } });
}

/**
 * Race-safe phase advance.
 *
 * Reads the current `(phase, phaseEndsAt)` outside a transaction, then uses
 * `updateMany` with those two values as a guard so only one caller wins when
 * many clients poll at the same instant. If we lose the race, `count === 0`
 * and we return without touching anything. Settlement runs inside the same
 * transaction as the winning update, and is additionally guarded by an
 * existence check on `BattleResult` so a retry cannot double-pay rewards.
 */
export async function advancePhaseIfDue(roomId: string): Promise<RoomPhase | null> {
  const snap = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      phase: true,
      phaseEndsAt: true,
      revealSec: true,
      uploadSec: true,
      votingSec: true,
      lengthMin: true,
    },
  });
  if (!snap || !snap.phaseEndsAt) return null;
  if (snap.phaseEndsAt.getTime() > Date.now()) return null;
  if (snap.phase === "RESULTS" || snap.phase === "CANCELLED" || snap.phase === "LOBBY") {
    return null;
  }

  const target = nextPhase(snap.phase);
  if (!target) return null;

  const duration = durationForPhase(target, snap);
  const newPhaseEndsAt = duration ? new Date(Date.now() + duration * 1000) : null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.room.updateMany({
      where: {
        id: roomId,
        phase: snap.phase,
        phaseEndsAt: snap.phaseEndsAt,
      },
      data:
        target === "RESULTS"
          ? { phase: "RESULTS", phaseEndsAt: null, endedAt: new Date() }
          : { phase: target, phaseEndsAt: newPhaseEndsAt },
    });
    if (updated.count === 0) return null;

    if (target === "RESULTS") {
      await settleResults(tx, roomId);
    }
    return target;
  });
}

/**
 * @deprecated Use `advancePhaseIfDue`. Kept for any caller that still wants
 * "advance-if-needed-and-return-current" semantics; routes should migrate.
 */
export async function tickPhase(roomId: string): Promise<RoomPhase | null> {
  const advanced = await advancePhaseIfDue(roomId);
  if (advanced) return advanced;
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { phase: true } });
  return room?.phase ?? null;
}

type TxClient = Prisma.TransactionClient;

/**
 * Called after VOTING: compute track scores, write BattleResult,
 * update user xp/currency/level/wins/streak, trigger badges/notifications.
 *
 * Idempotent: if any BattleResult row exists for this room we skip — this
 * keeps a retried or double-fired settlement from paying out twice.
 */
async function settleResults(tx: TxClient, roomId: string): Promise<void> {
  const alreadySettled = await tx.battleResult.count({ where: { roomId } });
  if (alreadySettled > 0) return;

  const [room, tracks, players] = await Promise.all([
    tx.room.findUniqueOrThrow({
      where: { id: roomId },
      select: { genre: true },
    }),
    tx.track.findMany({
      where: { roomId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        votes: { select: { rating: true } },
      },
    }),
    tx.roomPlayer.findMany({
      where: { roomId },
      select: { userId: true },
    }),
  ]);

  const placements = placementsFor(
    tracks.map((t) => ({
      userId: t.userId,
      submittedAt: t.createdAt,
      votes: t.votes.map((v) => ({ rating: v.rating })),
    })),
  );

  const placeByUser = new Map(placements.map((p) => [p.userId, p]));
  const newBadgeCodesByUser = new Map<string, string[]>();

  // Reward everyone who submitted; RoomPlayers without tracks get last place with zero rewards.
  const allParticipantIds = new Set<string>([
    ...players.map((p) => p.userId),
    ...tracks.map((t) => t.userId),
  ]);

  for (const userId of allParticipantIds) {
    const p = placeByUser.get(userId);
    const place = p?.place ?? placements.length + 1;
    const trackScore = p?.trackScore ?? 0;

    const award = p ? awardForPlace(place) : { xp: 0, coins: 0 };

    await tx.battleResult.create({
      data: {
        roomId,
        userId,
        place,
        trackScore,
        xpAwarded: award.xp,
        coinsAwarded: award.coins,
      },
    });

    if (award.xp > 0 || award.coins > 0 || place === 1) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { xp: true, wins: true, streak: true },
      });
      const newXp = user.xp + award.xp;
      const newLevel = levelForXp(newXp);
      const newTier = tierForXp(newXp);
      const isWin = place === 1;

      await tx.user.update({
        where: { id: userId },
        data: {
          xp: { increment: award.xp },
          currency: { increment: award.coins },
          wins: isWin ? { increment: 1 } : undefined,
          streak: isWin ? { increment: 1 } : 0,
          level: newLevel,
          tier: newTier,
        },
      });

      const awardedBadges = await evaluateBadgesOnBattleEnd(tx, {
        userId,
        roomGenre: room.genre,
        place,
        trackScore,
      });
      if (awardedBadges.length) newBadgeCodesByUser.set(userId, awardedBadges);
    }
  }

  // Participation XP for every voter.
  const voters = await tx.vote.findMany({
    where: { track: { roomId } },
    select: { voterId: true },
    distinct: ["voterId"],
  });
  for (const v of voters) {
    await tx.user.update({
      where: { id: v.voterId },
      data: { xp: { increment: VOTE_PARTICIPATION_XP } },
    });
  }

  // Batch badge notifications inside this transaction.
  
  for (const [userId, codes] of newBadgeCodesByUser) {
    for (const code of codes) {
      const badge = await tx.badge.findUnique({ where: { code } });
      if (!badge) continue;
      await tx.notification.create({
        data: {
          userId,
          type: "BADGE",
          message: `You earned the **${badge.name}** badge`,
          read: false,
        },
      });
    }
  }
}

export type TrackView = {
  id: string;
  userId: string | null;
  createdAt: Date;
  audioUrl: string | null;
  /** Stable "A", "B", … label. Used for blind voting UI. */
  anonymousLabel: string;
  /** True when this track belongs to the viewer. */
  mine: boolean;
  /** Viewer's own vote on this track — only populated during VOTING. */
  myVote: { rating: string; locked: boolean } | null;
};

/**
 * GET room — advances the phase if overdue, then returns a viewer-scoped
 * snapshot. During VOTING we never leak `track.userId` for tracks that don't
 * belong to the viewer, so blind voting stays blind.
 */
export async function getRoomState(code: string, viewerId: string | null) {
  const base = await prisma.room.findUnique({
    where: { code },
    select: { id: true, phase: true, phaseEndsAt: true },
  });
  if (!base) return null;

  // Only members can trigger phase advances. The route layer enforces this
  // (non-member pollers get viewerId=null), so outsiders can't push the clock.
  if (
    viewerId &&
    base.phaseEndsAt &&
    base.phaseEndsAt.getTime() <= Date.now() &&
    base.phase !== "RESULTS" &&
    base.phase !== "CANCELLED"
  ) {
    try {
      await advancePhaseIfDue(base.id);
    } catch (err) {
      console.error("[getRoomState] advance fail", err);
    }
  }

  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      host: { select: { id: true, username: true, level: true, initials: true } },
      players: {
        include: {
          user: { select: { id: true, username: true, initials: true, level: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      tracks: {
        select: {
          id: true,
          userId: true,
          createdAt: true,
          audioUrl: true,
        },
        orderBy: { id: "asc" }, // stable for anonymous-label assignment
      },
      results: {
        orderBy: { place: "asc" },
        include: {
          user: { select: { id: true, username: true, initials: true, level: true } },
        },
      },
    },
  });
  if (!room) return null;

  const isBlind = room.phase === "VOTING";

  // Load the viewer's votes so the client can render selection + lock state.
  const myVotes =
    isBlind && viewerId
      ? await prisma.vote.findMany({
          where: { voterId: viewerId, track: { roomId: room.id } },
          select: { trackId: true, rating: true, lockedAt: true },
        })
      : [];
  const voteByTrack = new Map(
    myVotes.map((v) => [v.trackId, { rating: v.rating, locked: v.lockedAt !== null }]),
  );

  const tracks: TrackView[] = room.tracks.map((t, idx) => ({
    id: t.id,
    // Redact owner for blind voting. Viewer's own track is always identifiable
    // to them (so the UI can skip it).
    userId: isBlind && t.userId !== viewerId ? null : t.userId,
    createdAt: t.createdAt,
    audioUrl: t.audioUrl,
    anonymousLabel: labelFor(idx),
    mine: viewerId !== null && t.userId === viewerId,
    myVote: voteByTrack.get(t.id) ?? null,
  }));

  return { ...room, tracks };
}

/** A, B, … Z, AA, AB, … (supports >26 tracks, though we cap to 8 players). */
function labelFor(idx: number): string {
  let n = idx;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Create a notification (used for outbound room invites). */
export async function sendRoomInvite(params: { fromUserId: string; toUserId: string; roomCode: string }) {
  const from = await prisma.user.findUniqueOrThrow({
    where: { id: params.fromUserId },
    select: { username: true },
  });
  return createNotification({
    userId: params.toUserId,
    type: "INVITE",
    message: `**@${from.username}** invited you to **${params.roomCode}**`,
    actionPrimary: "JOIN",
    actionPayload: { roomCode: params.roomCode },
  });
}
