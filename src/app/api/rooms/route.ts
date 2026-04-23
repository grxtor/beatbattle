import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type RoomGenre } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPublicRooms } from "@/lib/queries";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

const ROOM_GENRES = ["TRAP", "LOFI", "HIPHOP", "HOUSE", "FX", "RANDOM"] as const;
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
const PRIVACIES = ["PUBLIC", "PRIVATE"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  genre: z.enum(ROOM_GENRES).default("TRAP"),
  lengthMin: z.number().int().min(5).max(120).default(20),
  maxPlayers: z.number().int().min(2).max(16).default(8),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  privacy: z.enum(PRIVACIES).default("PUBLIC"),
});

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
function randomCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const createLimit = await rateLimit(
    `roomcreate:${session.user.id}`,
    RATE_LIMITS.roomCreate,
  );
  if (!createLimit.ok) return tooManyRequests(createLimit.retryAfter);

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }

  const activeHostedRooms = await prisma.room.count({
    where: {
      hostId: session.user.id,
      endedAt: null,
      phase: { not: "CANCELLED" },
    },
  });
  if (activeHostedRooms >= 3) {
    return NextResponse.json(
      { error: "active room limit reached" },
      { status: 409 },
    );
  }

  const name =
    parsed.data.name ??
    `${session.user.username ?? "Producer"}'s Room`;

  // Retry the whole create on unique-code collision. Doing the check-then-insert
  // separately raced at high load — relying on the DB unique index is tighter.
  const MAX_ATTEMPTS = 6;
  let room: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      room = await prisma.room.create({
        data: {
          code: randomCode(),
          name,
          hostId: session.user.id,
          genre: parsed.data.genre as RoomGenre,
          lengthMin: parsed.data.lengthMin,
          maxPlayers: parsed.data.maxPlayers,
          difficulty: parsed.data.difficulty,
          privacy: parsed.data.privacy,
          players: {
            create: {
              userId: session.user.id,
              isHost: true,
              isReady: true,
            },
          },
        },
        select: { id: true, code: true },
      });
      break;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
  if (!room) {
    console.error("[rooms] code alloc exhausted after", MAX_ATTEMPTS);
    return NextResponse.json({ error: "room code alloc failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, room }, { status: 201 });
}

/** List public rooms shaped for RoomsPanel / browse page clients. */
export async function GET(request: Request) {
  const session = await auth();
  const url = new URL(request.url);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") ?? 24)));
  const rooms = await getPublicRooms(session?.user?.id, limit);
  return NextResponse.json({ rooms });
}
