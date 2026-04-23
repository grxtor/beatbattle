/**
 * Game rules — XP / level / tier / reward math.
 * Single source of truth for server and seed.
 */

import type { RoomGenre } from "@prisma/client";

/* ---- Level & tier ---- */

const XP_PER_LEVEL = 500;

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

export function nextLevelXp(xp: number): number {
  return levelForXp(xp) * XP_PER_LEVEL;
}

type TierDef = { name: string; short: string; min: number };

const TIERS: TierDef[] = [
  { name: "BRONZE III", short: "B3", min: 0 },
  { name: "BRONZE II",  short: "B2", min: 1000 },
  { name: "BRONZE I",   short: "B1", min: 3000 },
  { name: "SILVER III", short: "S3", min: 6000 },
  { name: "SILVER II",  short: "S2", min: 10000 },
  { name: "SILVER I",   short: "S1", min: 15000 },
  { name: "GOLD III",   short: "G3", min: 25000 },
  { name: "GOLD II",    short: "G2", min: 40000 },
  { name: "GOLD I",     short: "G1", min: 60000 },
  { name: "PLATINUM",   short: "P",  min: 80000 },
  { name: "DIAMOND II", short: "D2", min: 110000 },
  { name: "DIAMOND I",  short: "D1", min: 150000 },
  { name: "MASTER",     short: "M",  min: 200000 },
  { name: "LEGEND",     short: "L",  min: 300000 },
];

export function tierForXp(xp: number): string {
  let chosen = TIERS[0];
  for (const t of TIERS) if (xp >= t.min) chosen = t;
  return chosen.name;
}

export function rankShort(tierName: string): string {
  const t = TIERS.find((x) => x.name === tierName);
  if (t) return t.short;
  return tierName
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 3);
}

/* ---- Rewards ---- */

export type Award = { xp: number; coins: number };

/** Placement → reward. 1 = winner. */
export function awardForPlace(place: number): Award {
  if (place === 1) return { xp: 100, coins: 50 };
  if (place === 2) return { xp: 60, coins: 30 };
  if (place === 3) return { xp: 30, coins: 15 };
  return { xp: 10, coins: 5 };
}

/** Participation reward for users who complete voting. */
export const VOTE_PARTICIPATION_XP = 5;

/* ---- Vote values ---- */

export type VoteRating =
  | "INSANE"
  | "VERY_GOOD"
  | "GOOD"
  | "OKAY"
  | "BAD"
  | "VERY_BAD";

export const VOTE_VALUE: Record<VoteRating, number> = {
  INSANE: 5,
  VERY_GOOD: 4,
  GOOD: 3,
  OKAY: 2,
  BAD: 1,
  VERY_BAD: 0,
};

/* ---- Sample pool ---- */

export const SAMPLE_POOL: Record<RoomGenre, string[]> = {
  TRAP: [
    "808 KICK", "HI-HAT ROLL", "SNARE CLAP", "TRAP VOX",
    "DARK PAD", "FLUTE LOOP", "BRASS STAB", "KICK BOOM",
  ],
  LOFI: [
    "VINYL LOOP", "RHODES CHORD", "JAZZ SNARE", "VOX CHOP",
    "RAIN FX", "TAPE HISS", "MELLOW PIANO", "DUSTY KICK",
  ],
  HIPHOP: [
    "BOOM BAP KICK", "SCRATCH FX", "SOUL VOX", "BASS LINE",
    "HORN STAB", "SNARE CRACK", "HI-HAT", "OLD DRUMS",
  ],
  HOUSE: [
    "4/4 KICK", "PLUCK SYNTH", "HANDCLAP", "ACID BASS",
    "PIANO STAB", "VOCAL LOOP", "HI-HAT OPEN", "STRING PAD",
  ],
  FX: [
    "RISER", "IMPACT", "REVERSE CYMBAL", "SWEEP",
    "GLITCH FX", "WHITE NOISE", "BOOMS", "TEXTURE LOOP",
  ],
  RANDOM: [
    "808 KICK", "VINYL LOOP", "BOOM BAP KICK", "HI-HAT ROLL",
    "PIANO STAB", "SCRATCH FX", "VOX CHOP", "PLUCK SYNTH",
  ],
};

export type BattleSample = {
  name: string;
  duration: string;
  audioUrl: string | null;
};
export type SampleSet = BattleSample[];

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randDuration(): string {
  const s = 2 + Math.floor(Math.random() * 9); // 2-10 sec
  return `0:${s.toString().padStart(2, "0")}`;
}

/** Fantasy pool roll — used as a fallback when the DB has no real library samples for this genre. */
export function rollSamples(genre: RoomGenre, count = 4): SampleSet {
  const pool = SAMPLE_POOL[genre] ?? SAMPLE_POOL.RANDOM;
  return shuffle(pool)
    .slice(0, count)
    .map((name) => ({ name, duration: randDuration(), audioUrl: null }));
}

/* ---- Placement math ---- */

export type TrackForScoring = {
  userId: string;
  submittedAt: Date;
  votes: { rating: VoteRating }[];
};

export type Placement = {
  userId: string;
  place: number;
  trackScore: number;
  voteCount: number;
};

export function placementsFor(tracks: TrackForScoring[]): Placement[] {
  const scored = tracks.map((t) => {
    const score = t.votes.reduce((sum, v) => sum + VOTE_VALUE[v.rating], 0);
    return {
      userId: t.userId,
      trackScore: score,
      voteCount: t.votes.length,
      submittedAt: t.submittedAt,
    };
  });

  // score DESC, tie-break by earliest submit
  scored.sort(
    (a, b) =>
      b.trackScore - a.trackScore ||
      a.submittedAt.getTime() - b.submittedAt.getTime(),
  );

  return scored.map((s, i) => ({
    userId: s.userId,
    place: i + 1,
    trackScore: s.trackScore,
    voteCount: s.voteCount,
  }));
}
