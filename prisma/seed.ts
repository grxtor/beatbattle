import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, RoomGenre, FriendshipStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Dev convenience: each user's password equals their username.
// producer / producer, beatsmith / beatsmith, etc.
async function hashFor(username: string) {
  return bcrypt.hash(username, 10);
}

type SeedUser = {
  username: string;
  initials: string;
  level: number;
  xp: number;
  wins: number;
  streak?: number;
  currency?: number;
  tier: string;
  online: boolean;
};

// Mock data → persistent seed. Source for the visible fields we used to render from mock.ts.
const USERS: SeedUser[] = [
  { username: "producer",  initials: "AE", level: 12, xp: 1860,   wins: 24,  streak: 7, currency: 650, tier: "BRONZE III", online: true  },
  { username: "drumgod",   initials: "DG", level: 58, xp: 184500, wins: 412, tier: "LEGEND",     online: false },
  { username: "808queen",  initials: "8Q", level: 47, xp: 128400, wins: 298, tier: "MASTER",     online: true  },
  { username: "beatsmith", initials: "BS", level: 42, xp: 98200,  wins: 241, tier: "DIAMOND I",  online: true  },
  { username: "trapzen",   initials: "TZ", level: 38, xp: 74800,  wins: 194, tier: "DIAMOND II", online: true  },
  { username: "lofiking",  initials: "LK", level: 35, xp: 64100,  wins: 172, tier: "PLATINUM",   online: true  },
  { username: "vinyloop",  initials: "VL", level: 32, xp: 52300,  wins: 156, tier: "PLATINUM",   online: false },
  { username: "bassface",  initials: "BF", level: 29, xp: 43700,  wins: 138, tier: "GOLD I",     online: true  },
  { username: "synthwave", initials: "SW", level: 26, xp: 36200,  wins: 121, tier: "GOLD II",    online: false },
];

type SeedRoom = {
  code: string;
  name: string;
  hostUsername: string;
  genre: RoomGenre;
  lengthMin: number;
  maxPlayers: number;
  currentPlayers: number;
  featured?: boolean;
};

const ROOMS: SeedRoom[] = [
  { code: "BX7K2M", name: "Trap Kings",        hostUsername: "beatsmith", genre: "TRAP",   lengthMin: 20, maxPlayers: 8,  currentPlayers: 3, featured: true },
  { code: "KR4M9P", name: "Lo-Fi After Hours", hostUsername: "808queen",  genre: "LOFI",   lengthMin: 30, maxPlayers: 6,  currentPlayers: 5 },
  { code: "ZN8V3L", name: "Old School Flip",   hostUsername: "drumgod",   genre: "HIPHOP", lengthMin: 15, maxPlayers: 4,  currentPlayers: 2 },
  { code: "JM6S0F", name: "Free For All",      hostUsername: "bassface",  genre: "RANDOM", lengthMin: 20, maxPlayers: 16, currentPlayers: 7 },
];

type SeedPack = {
  name: string;
  genre: RoomGenre;
  samples: number;
  price: number;
  icon: string;
  isNew: boolean;
  unlockLvl: number | null;
  description: string;
  sampleNames: string[];
};

const SHOP_PACKS: SeedPack[] = [
  {
    name: "TRAP ESSENTIALS", genre: "TRAP", samples: 24, price: 0, icon: "♪",
    isNew: false, unlockLvl: null,
    description: "Your starter kit. Punchy 808s, snappy snares, and melodic stabs.",
    sampleNames: [
      "808 KICK", "808 SLIDE", "HI-HAT ROLL", "CLAP",
      "SNARE CLAP", "TRAP VOX", "DARK PAD", "FLUTE LOOP",
      "BRASS STAB", "KICK BOOM", "CYMBAL RIDE", "RIM TICK",
      "VOX SHOUT", "PERC LOOP", "PLUCK MELODY", "BELL HIT",
      "SUB BASS", "RISER FX", "IMPACT HIT", "VINYL CRACKLE",
      "REVERSE CRASH", "FILL SNARE", "OPEN HAT", "KICK VARIANT",
    ],
  },
  {
    name: "LO-FI VINYL", genre: "LOFI", samples: 36, price: 500, icon: "◉",
    isNew: true, unlockLvl: null,
    description: "Dusty chords, tape hiss, and warm mellow drums.",
    sampleNames: [
      "VINYL LOOP", "RHODES CHORD", "JAZZ SNARE", "VOX CHOP",
      "RAIN FX", "TAPE HISS", "MELLOW PIANO", "DUSTY KICK",
      "BRUSH SNARE", "WALKING BASS", "MUTED TRUMPET", "SOFT PAD",
      "CHILL HAT", "CHAIR CREAK", "LO-FI CRASH", "VINYL POP",
      "ACOUSTIC GTR", "VIBE CHORD", "WURLI CHORD", "BASS SLIDE",
      "WHISPER VOX", "JAZZ RIDE", "BRUSH KICK", "WARM SUB",
      "BOOK THUD", "ROOM TONE", "COFFEE STIR", "CLOCK TICK",
      "CASSETTE FLIP", "OLD RADIO", "SOFT SHAKER", "GENTLE KICK",
      "LAZY HAT", "SOFT CLAP", "DREAM PAD", "MELLOW LOOP",
    ],
  },
  {
    name: "HIP-HOP GOLD", genre: "HIPHOP", samples: 48, price: 1200, icon: "♫",
    isNew: false, unlockLvl: null,
    description: "Classic boom-bap chops, horn stabs, and grit.",
    sampleNames: [
      "BOOM BAP KICK", "SCRATCH FX", "SOUL VOX", "BASS LINE",
      "HORN STAB", "SNARE CRACK", "HI-HAT", "OLD DRUMS",
      "FUNKY BREAK", "JAMES BROWN SNARE", "JAZZ PIANO", "ORGAN HIT",
      "WAH GUITAR", "SOUL CHOP", "VINYL SCRATCH", "DIRTY KICK",
      "CLAP ONE-SHOT", "BELL LOOP", "CROWD NOISE", "VOCAL YELL",
      "CONGA HIT", "BONGOS LOOP", "STRING LOOP", "HORN LOOP",
      "BASS WALK", "DRUM BREAK", "REVERSE HIT", "RIMSHOT",
      "RIDE CYMBAL", "TAMBOURINE", "GUITAR STAB", "BRASS RIFF",
      "SYNTH PLUCK", "808 KICK", "RAP ADLIB", "TURNTABLE RUB",
      "BREAK LOOP", "CRATE DIG", "DUSTY CHORD", "FLUTE LINE",
      "WHISTLE", "SAX RIFF", "KEY CHOP", "BASS DROP",
      "BOOM HIT", "CLAP STACK", "VINYL WARP", "KICK SLAP",
    ],
  },
  {
    name: "808 HEAT", genre: "TRAP", samples: 32, price: 800, icon: "◎",
    isNew: false, unlockLvl: null,
    description: "Thirty-two 808 variations — short, long, distorted, glided.",
    sampleNames: Array.from({ length: 32 }, (_, i) => `808 VARIANT ${String(i + 1).padStart(2, "0")}`),
  },
  {
    name: "HOUSE SERUM", genre: "HOUSE", samples: 42, price: 1500, icon: "◈",
    isNew: false, unlockLvl: null,
    description: "Four-on-the-floor kicks, acid basses, and shimmering pads.",
    sampleNames: [
      "4/4 KICK", "PLUCK SYNTH", "HANDCLAP", "ACID BASS",
      "PIANO STAB", "VOCAL LOOP", "HI-HAT OPEN", "STRING PAD",
      "FILTER SWEEP", "DISCO HAT", "CLOSED HAT", "DISCO SNARE",
      "STRING STAB", "RAVE LEAD", "PIANO LOOP", "WARM PAD",
      "CHORD STAB", "BOOM KICK", "CLAP LAYER", "ROLL SNARE",
      "BASS PLUCK", "VOCAL CHOP", "RISER FX", "IMPACT",
      "TOM FILL", "WHITE NOISE", "ARP LINE", "HI TOM",
      "KICK LAYER", "SUB KICK", "SIDECHAIN LOOP", "DEEP PAD",
      "AIRY LEAD", "FM BASS", "STAB LOOP", "SYNTH HIT",
      "COMBO CHORD", "DISCO CLAP", "TECH HAT", "MELODY LOOP",
      "BIG PAD", "TEXTURE",
    ],
  },
  {
    name: "DRUMS VOL.1", genre: "FX", samples: 64, price: 300, icon: "⚈",
    isNew: false, unlockLvl: null,
    description: "Clean, unopinionated drum hits — kicks, snares, hats, percussion.",
    sampleNames: [
      ...Array.from({ length: 16 }, (_, i) => `KICK ${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 16 }, (_, i) => `SNARE ${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 16 }, (_, i) => `HAT ${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 16 }, (_, i) => `PERC ${String(i + 1).padStart(2, "0")}`),
    ],
  },
  {
    name: "SYNTHWAVE DRIFT", genre: "LOFI", samples: 28, price: 2000, icon: "▣",
    isNew: false, unlockLvl: 15,
    description: "Neon-soaked retro synths, gated reverbs, and glistening arps.",
    sampleNames: [
      "NEON PAD", "GATED SNARE", "ARP LOOP", "SUPER SAW",
      "ANALOG LEAD", "FM BASS", "VHS NOISE", "80S TOM",
      "GLISS UP", "CLAP HIT", "REVERB CRASH", "ELECTRIC PIANO",
      "SYNTH STAB", "RETRO CHORD", "PLUCK LEAD", "PAD SWELL",
      "SOLAR SYNTH", "ORGAN PAD", "CHOIR HIT", "SAW BASS",
      "SQUARE BASS", "TAPE DELAY", "LASER FX", "TELEPHONE RING",
      "BRASS STAB", "CITY AMBIENCE", "NEON SWEEP", "VAPOR LOOP",
    ],
  },
  {
    name: "FX ATMOSPHERE", genre: "FX", samples: 56, price: 2500, icon: "◬",
    isNew: false, unlockLvl: 18,
    description: "Risers, impacts, textures, and weird noises to glue a track together.",
    sampleNames: [
      ...Array.from({ length: 14 }, (_, i) => `RISER ${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 14 }, (_, i) => `IMPACT ${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 14 }, (_, i) => `TEXTURE ${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 14 }, (_, i) => `GLITCH ${String(i + 1).padStart(2, "0")}`),
    ],
  },
  {
    name: "OLD SOUL BREAKS", genre: "HIPHOP", samples: 40, price: 3000, icon: "✦",
    isNew: false, unlockLvl: 22,
    description: "Deep-crate drum breaks and soulful chops for the headnods.",
    sampleNames: Array.from({ length: 40 }, (_, i) => `SOUL BREAK ${String(i + 1).padStart(2, "0")}`),
  },
  {
    name: "LEGEND VAULT", genre: "TRAP", samples: 72, price: 5000, icon: "✧",
    isNew: false, unlockLvl: 30,
    description: "The boss pack. Producer-grade trap samples, hand-picked.",
    sampleNames: Array.from({ length: 72 }, (_, i) => `VAULT ${String(i + 1).padStart(2, "0")}`),
  },
];

const NOTIFICATIONS = [
  { type: "FRIEND"  as const, message: "**@kickhead** sent you a friend request",           read: false, actionPrimary: "ACCEPT", actionSecondary: "DECLINE" },
  { type: "INVITE"  as const, message: "**@808queen** invited you to **KR4M9P**",           read: false, actionPrimary: "JOIN",   actionSecondary: null },
  { type: "BADGE"   as const, message: "You earned the **INSANE** badge — 10 perfect votes", read: true,  actionPrimary: null,    actionSecondary: null },
  { type: "INVITE"  as const, message: "**@beatsmith** invited you to **BX7K2M**",          read: true,  actionPrimary: "JOIN",   actionSecondary: null },
  { type: "SYSTEM"  as const, message: "Daily Challenge resets in **14h** — flip the mystery sample", read: true, actionPrimary: null, actionSecondary: null },
  { type: "FRIEND"  as const, message: "**@mellowmax** accepted your friend request",       read: true,  actionPrimary: null,    actionSecondary: null },
];

async function main() {
  console.log("[seed] users…");
  // Dev ergonomics: pull lastSeenAt to now for seed-online users so
  // FriendsPanel shows them as online/in-room immediately (presence cutoff = 2min).
  const now = new Date();
  for (const u of USERS) {
    const passwordHash = await hashFor(u.username);
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        initials: u.initials, level: u.level, xp: u.xp, wins: u.wins,
        streak: u.streak ?? 0, currency: u.currency ?? 0,
        tier: u.tier, online: u.online, passwordHash,
        lastSeenAt: u.online ? now : undefined,
      },
      create: {
        username: u.username, initials: u.initials, level: u.level, xp: u.xp,
        wins: u.wins, streak: u.streak ?? 0, currency: u.currency ?? 0,
        tier: u.tier, online: u.online, passwordHash,
        lastSeenAt: u.online ? now : new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
    });
  }

  console.log("[seed] badges…");
  const BADGES = [
    { code: "FIRST_WIN",   name: "FIRST WIN",   icon: "★", description: "Win your first battle" },
    { code: "BATTLES_10",  name: "10 BATTLES",  icon: "◆", description: "Compete in 10 battles" },
    { code: "BATTLES_50",  name: "50 BATTLES",  icon: "◇", description: "Compete in 50 battles" },
    { code: "TRAP_MASTER", name: "TRAP MASTER", icon: "♪", description: "Win 5 TRAP battles" },
    { code: "LOFI_FLIP",   name: "LO-FI FLIP",  icon: "◉", description: "Win 3 LO-FI battles" },
    { code: "STREAK_WEEK", name: "STREAK WEEK", icon: "✧", description: "7-win streak" },
    { code: "INSANE_10",   name: "INSANE",      icon: "✦", description: "Receive 10 INSANE votes" },
    { code: "TOP_100",     name: "TOP 100",     icon: "▲", description: "Top 100 on the leaderboard", unlockLvl: null as number | null },
    { code: "LEGEND",      name: "LEGEND",      icon: "✪", description: "Reach Legend tier", unlockLvl: 50 },
  ];
  for (const b of BADGES) {
    await prisma.badge.upsert({
      where: { code: b.code },
      update: { name: b.name, icon: b.icon, description: b.description, unlockLvl: b.unlockLvl ?? null },
      create: { code: b.code, name: b.name, icon: b.icon, description: b.description, unlockLvl: b.unlockLvl ?? null },
    });
  }

  const me = await prisma.user.findUniqueOrThrow({ where: { username: "producer" } });

  console.log("[seed] friendships…");
  const friendUsernames = ["beatsmith", "lofiking", "808queen", "trapzen", "drumgod", "vinyloop"];
  for (const name of friendUsernames) {
    const f = await prisma.user.findUniqueOrThrow({ where: { username: name } });
    await prisma.friendship.upsert({
      where: { requesterId_addresseeId: { requesterId: me.id, addresseeId: f.id } },
      update: { status: FriendshipStatus.ACCEPTED },
      create: { requesterId: me.id, addresseeId: f.id, status: FriendshipStatus.ACCEPTED },
    });
  }

  // Rooms are NOT seeded anymore — they're organic (users create via UI).
  // The ROOMS constant above is kept for reference but deliberately skipped here.
  void ROOMS;

  console.log("[seed] shop packs…");
  for (const p of SHOP_PACKS) {
    const pack = await prisma.shopPack.upsert({
      where: { name: p.name },
      update: {
        genre: p.genre, samples: p.samples, price: p.price, icon: p.icon,
        isNew: p.isNew, unlockLvl: p.unlockLvl, description: p.description,
      },
      create: {
        name: p.name, genre: p.genre, samples: p.samples, price: p.price,
        icon: p.icon, isNew: p.isNew, unlockLvl: p.unlockLvl,
        description: p.description,
      },
    });

    // Replace the sample list for this pack every run (cheap, idempotent).
    await prisma.sample.deleteMany({ where: { packId: pack.id } });
    if (p.sampleNames.length) {
      await prisma.sample.createMany({
        data: p.sampleNames.map((name, idx) => ({
          packId: pack.id,
          name,
          duration: `0:0${2 + (idx % 8)}`,
          orderIdx: idx,
        })),
      });
    }
  }

  // give the "me" user the free pack
  const freePack = await prisma.shopPack.findUnique({ where: { name: "TRAP ESSENTIALS" } });
  if (freePack) {
    await prisma.userPack.upsert({
      where: { userId_packId: { userId: me.id, packId: freePack.id } },
      update: {},
      create: { userId: me.id, packId: freePack.id },
    });
  }

  console.log("[seed] notifications…");
  await prisma.notification.deleteMany({ where: { userId: me.id } });
  await prisma.notification.createMany({
    data: NOTIFICATIONS.map((n) => ({
      userId: me.id,
      type: n.type,
      message: n.message,
      read: n.read,
      actionPrimary: n.actionPrimary,
      actionSecondary: n.actionSecondary,
    })),
  });

  const counts = {
    users: await prisma.user.count(),
    rooms: await prisma.room.count(),
    packs: await prisma.shopPack.count(),
    notifs: await prisma.notification.count(),
    friendships: await prisma.friendship.count(),
  };
  console.log("[seed] done:", counts);
}

main()
  .catch((err) => {
    console.error("[seed] error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
