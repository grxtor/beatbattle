# BeatBattle

BeatBattle is an online beat-making battle platform for producers.

Players enter a room, receive the same set of samples, make a beat within a
time limit, upload their track, and vote blindly on the other submissions.
After voting closes, BeatBattle calculates placements, awards XP and coins,
updates ranks, and shows the final results.

The goal is simple: same samples, same clock, best flip wins.

## What The Platform Does

BeatBattle turns beat-making into a structured multiplayer game:

- Producers can create public or private battle rooms.
- Friends can join by invite or room code.
- Every battle starts by revealing a shared sample kit.
- Players download the samples, make a track in their DAW, and upload audio.
- Voting is anonymous so tracks are judged before names are revealed.
- Results are scored server-side and converted into XP, coins, wins, streaks,
  badges, and leaderboard movement.
- Players can buy sample packs, manage profiles, link OAuth accounts, and keep
  track of friends, notifications, and active rooms.

It is built for quick, repeatable music challenges rather than long-form
collaboration. A battle should feel like a timed producer cypher: fast setup,
clear rules, blind judging, and visible progression.

## Core Game Flow

1. **Create or join a room**
   A host picks genre, difficulty, length, capacity, and privacy. Other players
   join from the room list, invite link, or room code.

2. **Ready up**
   Players mark themselves ready in the lobby. The host starts the battle.

3. **Reveal samples**
   The server rolls a shared kit. Players can preview samples in the browser
   and download them as a ZIP.

4. **Produce**
   Everyone makes a beat against the countdown.

5. **Upload**
   Players submit an mp3, wav, or ogg track. The server validates the file
   before accepting it.

6. **Vote**
   Tracks are labeled anonymously. Players cannot vote for their own track.

7. **Results**
   Scores are calculated, placements are assigned, and rewards are paid out.

## Main Features

- Multiplayer battle rooms with public and private modes
- Quick match, browse, create, join-by-code, and invite flows
- Server-controlled battle phases and timers
- Shared sample reveal and downloadable sample ZIPs
- Audio upload with size, MIME, and magic-byte validation
- Blind voting with locked votes
- XP, coins, levels, ranks, wins, streaks, and badges
- Global, weekly, and friends leaderboard views
- Shop packs generated from local sample files
- Friend requests, suggestions, room invites, and notifications
- Presence tracking and active battle banner
- Room chat
- Profile, privacy, linked accounts, password, and account deletion settings
- Session invalidation and reauthentication checks for sensitive actions

## Who It Is For

BeatBattle is intended for:

- beatmakers who want short competitive challenges
- producer communities running sample-flip contests
- friends who want a structured way to battle with the same sounds
- streamers or Discord communities that want repeatable music game sessions

## Technical Overview

- **Framework:** Next.js 16 App Router with Turbopack
- **UI:** React 19
- **Auth:** Auth.js v5 with credentials login and optional Discord/Google OAuth
- **Database:** PostgreSQL 18
- **ORM:** Prisma 7
- **Rate limiting:** Redis, with an in-memory fallback for local development
- **Media:** disk-backed audio storage under `MEDIA_ROOT`
- **Package manager:** pnpm

## Requirements

- Node.js 22 recommended. Prisma 7.8 requires Node 20.19+, 22.12+, or 24+.
- pnpm 10
- PostgreSQL
- Redis for production or multi-instance deployments

## Environment

Create a local env file:

```bash
cp .env.example .env.local
```

Required for local development:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
MEDIA_ROOT="./media"
MEDIA_PUBLIC_BASE="/media"
```

Required for production:

```env
AUTH_URL="https://your-domain.example"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
REDIS_URL="redis://HOST:6379"
MEDIA_ROOT="/var/lib/beatbattle/media"
MEDIA_PUBLIC_BASE="/media"
```

Optional OAuth:

```env
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Generate an auth secret:

```bash
openssl rand -base64 32
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Apply migrations and seed sample data:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

Start the app:

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000
```

Seeded users use their username as password:

```txt
producer / producer
beatsmith / beatsmith
drumgod / drumgod
808queen / 808queen
trapzen / trapzen
lofiking / lofiking
vinyloop / vinyloop
bassface / bassface
synthwave / synthwave
```

## Common Commands

```bash
pnpm dev                         # local Next dev server
pnpm build                       # production build
pnpm start                       # production server after build
pnpm lint                        # ESLint
pnpm exec tsc --noEmit           # standalone TypeScript check
pnpm exec prisma validate        # validate Prisma schema
pnpm exec prisma studio          # database browser
pnpm exec prisma migrate deploy  # apply existing migrations
pnpm exec prisma migrate dev     # create/apply a development migration
pnpm exec prisma db seed         # idempotent seed
```

Windows helper scripts are available for a local PostgreSQL cluster:

```bash
pnpm db:local:init
pnpm db:local:start
pnpm db:local:status
pnpm db:local:stop
```

## Docker

Production compose expects external PostgreSQL and Redis. It mounts persistent
media from `/var/lib/beatbattle/media`.

```bash
cp .env.example .env
# Fill DATABASE_URL, AUTH_SECRET, AUTH_URL, REDIS_URL.
docker compose build
docker compose up -d
docker compose logs -f app
```

The Docker entrypoint:

- validates required production environment
- runs `prisma migrate deploy`
- optionally runs the bundled seed when `SEED_ON_BOOT=1`
- starts the Next standalone server

Self-contained dev stack with PostgreSQL and Redis:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Reset dev Docker data:

```bash
docker compose -f docker-compose.dev.yml down -v
```

## Media Storage

BeatBattle stores uploaded tracks and local sample files on disk.

```txt
MEDIA_ROOT/
  tracks/<roomId>/<trackId>.<random>.<mp3|wav|ogg>
  samples/<category>/<file>.<mp3|wav|ogg>
```

In development, Next serves `/media/...` through
`src/app/media/[...path]/route.ts`.

In production, nginx should serve `/media/` directly from `MEDIA_ROOT` so audio
bytes bypass the Node process.

## Sample Library

Drop audio files into:

```txt
MEDIA_ROOT/samples/<category>/
```

Supported extensions:

```txt
.mp3
.wav
.ogg
```

Known category directories get curated shop metadata:

```txt
808s
claps
kicks
snares
percussion
fx
```

Unknown directories are still imported as generic packs. Re-run the seed after
adding files:

```bash
pnpm exec prisma db seed
```

## Deployment Notes

For a Debian/nginx deployment:

1. Run the app behind nginx on `127.0.0.1:3000`.
2. Set `AUTH_URL` to the public origin.
3. Set `MEDIA_ROOT` to a persistent directory such as
   `/var/lib/beatbattle/media`.
4. Alias `/media/` in nginx to the same media directory.
5. Set `client_max_body_size` above the 30 MB upload cap, for example `35m`.

Example nginx media/proxy config:

```nginx
client_max_body_size 35m;

location /media/ {
  alias /var/lib/beatbattle/media/;
  expires 1y;
  add_header Cache-Control "public, immutable";
  add_header X-Content-Type-Options "nosniff";
  autoindex off;
}

location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Data Model Notes

Important persistent entities:

- `User`, `Account`, and JWT sessions with `sessionVersion`
- `Friendship` with canonical `pairKey` to prevent opposite-direction duplicates
- `Room`, `RoomPlayer`, `RoomMessage`, `Track`, and `Vote`
- `BattleResult`, `Badge`, and `UserBadge`
- `ShopPack`, `Sample`, and `UserPack`
- `Notification`

## Project Conventions

- Use pnpm. Do not add npm or yarn lockfiles.
- Read `AGENTS.md` before changing Next.js code. This project uses Next.js 16,
  and route APIs differ from older versions.
- Route handlers use `RouteContext<"...">` and async `ctx.params`.
- Server-only modules should import `server-only`.
- Use `rateLimit()` for mutating endpoints.
- Keep battle state transitions race-safe with transactions, `FOR UPDATE`, or
  guarded `updateMany` operations.
- UI text is English.

## Verification

Before pushing changes, run:

```bash
pnpm lint
pnpm exec prisma validate
pnpm build
```

Optional:

```bash
pnpm exec tsc --noEmit
```

`next build` generates Next route types; standalone `tsc --noEmit` may require
type generation first in a fresh checkout.

## Current Test Status

There is no dedicated test suite yet. The current safety checks are lint,
Prisma schema validation, TypeScript, and the production Next build.
