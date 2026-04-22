@AGENTS.md

# Beat Battle — project map for Claude

> Multiplayer beat-production battle game. Producers join a room, get 4 random
> samples, produce a track under a timer, vote blindly on each other's tracks,
> and earn XP + coins based on placement. Pixel + hand-drawn aesthetic.

## Stack

- **Framework**: Next.js 16.2.4 (App Router, Turbopack). **Read `AGENTS.md`** —
  Next 16 has breaking changes versus older training data. `fetch` is NOT cached
  by default. `params` is `Promise<{...}>`. `RouteContext<"/path">` is a global
  type, not imported.
- **DB**: PostgreSQL 18 + Prisma 7.7 with `@prisma/adapter-pg`. Schema URL lives
  in `prisma.config.ts` (Prisma 7 no longer reads `datasource.url` from schema).
- **Auth**: Auth.js v5 (`next-auth@beta`), JWT sessions, `@auth/prisma-adapter`
  for linked OAuth accounts. Credentials (username+password) + optional Discord
  + Google OAuth (env-gated).
- **Styling**: CSS Modules, Press_Start_2P + VT323 fonts, hand-drawn SVG
  displacement filter (`SketchDefs`).
- **Package manager**: **pnpm** (hard rule). `pnpm-lock.yaml` is source of truth.
- **Runtime libs**: `bcryptjs`, `zod`, `dotenv`, `server-only`, `tsx`.

## Environment

```
.env.local           # gitignored
  DATABASE_URL="postgresql://…"
  AUTH_SECRET="…"                   # openssl rand -base64 32
  # Optional — enables social sign-in if both set per provider:
  DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
  GOOGLE_CLIENT_ID  / GOOGLE_CLIENT_SECRET
```

## Data model (`prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `User` | Producer identity + XP/coin/level/tier/streak + privacy flags + `lastSeenAt` presence + optional `bio` |
| `Account` | NextAuth OAuth linked accounts |
| `Friendship` | PENDING / ACCEPTED / BLOCKED, two-sided unique |
| `Room` | Code, host, genre, lengthMin, maxPlayers, `phase`, `phaseEndsAt`, JSON `samples`, featured |
| `RoomPlayer` | Membership rows with `isHost`, `isReady` |
| `Track` | Per-(room, user) submission; `audioUrl` is nullable (MVP skipped upload) |
| `Vote` | Per-(track, voter) rating enum |
| `BattleResult` | Final per-user payout row: place, trackScore, xpAwarded, coinsAwarded |
| `ShopPack` / `UserPack` | Catalog + ownership |
| `Sample` | Per-pack sample list (name, duration, optional audioUrl) |
| `Badge` / `UserBadge` | Catalog + earned |
| `Notification` | typed (FRIEND/INVITE/BADGE/SYSTEM) + optional action buttons + JSON payload |

Enums: `FriendshipStatus`, `NotificationType`, `RoomGenre`, `RoomDifficulty`,
`RoomPrivacy`, `RoomPhase` (LOBBY/REVEAL/PRODUCTION/UPLOAD/VOTING/RESULTS/CANCELLED),
`VoteRating` (INSANE/VERY_GOOD/GOOD/OKAY/BAD/VERY_BAD).

Migrations live in `prisma/migrations/`. Seed is in `prisma/seed.ts`
(`pnpm prisma db seed`). Seed creates: mock users (password = username),
shop packs, per-pack samples, badges, notifications for `producer`. Rooms are
**not** seeded anymore — they're organic.

## Routes

### Pages

```
/                               Home (PLAY / LEADERBOARD / SHOP links)
/login · /signup                Credentials + optional OAuth buttons
/leaderboard?tab=global|weekly|friends
/shop                           Pack grid, click-to-open detail modal
/profile                        Own stats + badges + recent battles
/settings                       Profile edit / Privacy / Linked accounts
/play                           Mode picker (Quick / Multiplayer)
/play/quick                     Matchmaking stub → server joins a room
/play/multiplayer               Create / Join-by-code entry
/play/multiplayer/create        Form → POST /api/rooms
/play/multiplayer/join          6-char code grid
/play/room/[code]               Battle room (6 phases, polling)
```

Pages are **server components** that render client components as children
(JoinForm, CreateForm, QuickMatch, BattleRoom, ShopGrid, ProfileForm, etc.).

### API

Auth: `/api/auth/[...nextauth]`, `POST /api/auth/signup`

User: `PATCH /api/user/profile`, `PATCH /api/user/privacy`,
`DELETE /api/user/linked/[provider]`

Presence: `POST /api/presence` (client pings every 30s via `PresencePing`)

Friends: `POST /api/friends/request`, `GET /api/friends/suggestions`,
`POST /api/friends/[id]/accept`, `POST /api/friends/[id]/decline`,
`DELETE /api/friends/[id]`

Notifications: `GET /api/notifications`,
`POST /api/notifications/read-all`, `POST /api/notifications/[id]/read`

Rooms: `GET /api/rooms`, `POST /api/rooms`, `POST /api/rooms/quick`,
`GET /api/rooms/[code]` (polling entry, triggers phase tick),
`POST /api/rooms/[code]/join|leave|ready|start|submit|vote`

Shop: `GET /api/shop/[id]` (detail + ownership), `POST /api/shop/[id]/buy`

## Core systems

### Battle state machine (`src/lib/battle.ts`)

Phase order: `LOBBY → REVEAL → PRODUCTION → UPLOAD → VOTING → RESULTS`
(with `CANCELLED` as a terminal side-state).

- `startBattle(roomId, hostId)` — LOBBY→REVEAL, rolls 4 random samples from the
  genre-specific pool (`src/lib/game.ts:SAMPLE_POOL`), stamps `phaseEndsAt`.
- `tickPhase(roomId)` — inside a Prisma transaction: if `phaseEndsAt` passed,
  advance to the next phase. When entering RESULTS, calls `settleResults`.
- `getRoomState(code)` — used by `GET /api/rooms/[code]`; first triggers
  `tickPhase` lazily, then returns the full room with host, players, tracks,
  results. **Phase advancement is server-authoritative** — any poll can trigger
  it, but the server validates the clock.

Phase durations on `Room`: `revealSec` (30), `uploadSec` (120), `votingSec`
(60), plus `lengthMin * 60` for PRODUCTION.

### Economy (`src/lib/game.ts`)

- **XP per level**: 500 (linear).
- **Tiers**: BRONZE III → LEGEND, 14 brackets, `tierForXp(xp)`.
- **Rewards per placement**:

  | Place | XP | Coins |
  |---|---|---|
  | 1st | 100 | 50 |
  | 2nd | 60 | 30 |
  | 3rd | 30 | 15 |
  | 4th+ | 10 | 5 |

- **Vote values**: INSANE=5, VERY_GOOD=4, GOOD=3, OKAY=2, BAD=1, VERY_BAD=0.
- **Voter participation**: +5 XP for anyone who cast at least one vote.
- **Placement tie-break**: higher score first; ties broken by earliest
  `Track.createdAt`.
- **Streak**: +1 on win (place=1), reset to 0 on non-win.
- **Wins counter**: incremented on place=1 only.

`settleResults` writes `BattleResult` rows, updates user XP/coins/level/tier/
streak/wins, and calls `evaluateBadgesOnBattleEnd`. Voter XP is a separate pass.

### Badges (`src/lib/badges.ts`)

Auto-awarded on battle end:

- `FIRST_WIN` — first 1st place
- `BATTLES_10` / `BATTLES_50` — participated in N battles
- `TRAP_MASTER` — 5 TRAP-genre wins
- `LOFI_FLIP` — 3 LO-FI-genre wins
- `STREAK_WEEK` — 7 wins ever
- `INSANE_10` — received 10 INSANE votes cumulatively
- `TOP_100`, `LEGEND` — in catalog, trigger logic TBD

Earning a badge also creates a BADGE-type notification.

### Presence + live-only filtering (`src/lib/queries.ts`)

- **Cutoff**: `ONLINE_WINDOW_MIN = 2`. A user counts as online if they've
  pinged `/api/presence` within the last 2 min.
- `getFriendsFor(userId)` splits friends into online / offline + marks `inroom`
  if they're in an active-phase room.
- `getPublicRooms(viewerId)` filter: room is visible if ANY player has fresh
  presence OR was created in last 5 min OR viewer is a member. Viewer's own
  rooms float to the top.
- `getOnlineUserCount()` / `getActiveRoomCount()` drive the BrandPlate
  top-left counters.

### Zombie-room cleanup (`src/lib/roomCleanup.ts`)

Opportunistically runs from `getPublicRooms` and `/api/presence` (throttled to
once per 60s):

1. LOBBY rooms older than 10 min with zero active players → `CANCELLED`.
2. REVEAL/PRODUCTION/UPLOAD/VOTING rooms whose `phaseEndsAt` passed 5+ min ago
   with no one polling → `CANCELLED`.
3. Non-host `RoomPlayer` rows where user has been offline > 10 min → deleted.

### Shop + samples

Each pack in `ShopPack` has a `sampleList: Sample[]` populated by the seed
(24–72 samples per pack). Clicking a pack opens `PackDetailModal` that fetches
`GET /api/shop/[id]` and renders the sample list with (disabled) preview
buttons — `audioUrl` is null in MVP so nothing plays yet.

Purchase flow: `POST /api/shop/[id]/buy` runs a Prisma transaction that
decrements `User.currency` and creates a `UserPack` row. Pre-checks for
level-lock and affordability.

### Friends + notifications

- Requests go through `acceptFriendRequests` privacy check — rejected with
  403 if target user disabled it.
- Suggestions filter by `discoverable: true` AND `acceptFriendRequests: true`.
- FRIEND-type notification carries `{ friendshipId }` in `actionPayload` so
  ACCEPT/DECLINE buttons in the modal can hit the right friendship.
- INVITE-type notification carries `{ roomCode }` so JOIN button navigates.
- Notification messages use `**word**` markdown-lite — rendered via safe
  `<b>` splitting, not `dangerouslySetInnerHTML`.

### Privacy

On `User`:

- `acceptFriendRequests` — when off, friendship request endpoint returns 403.
- `showOnLeaderboard` — when off, user is filtered out of GLOBAL and WEEKLY
  leaderboard queries.
- `discoverable` — when off, user is excluded from friend suggestions.

Toggles live on `/settings` and fire `PATCH /api/user/privacy`.

## Client layout

- `AppShell` (server component) fetches the current user + side-panel data in a
  single `Promise.all` and passes props to `BrandPlate`, `UserCard`,
  `FriendsPanel`, `RoomsPanel`.
- `AppShell` takes `compact?: boolean` for the in-game screen (`/play/room/*`)
  — shrinks top strips and pulls content up via CSS transform.
- `PresencePing` mounts once in the root `layout.tsx`, pings every 30s while
  tab is visible.
- `UserCard` dropdown: VIEW PROFILE / SETTINGS / LOG OUT (LOG OUT uses a Server
  Action via `src/lib/auth-actions.ts`).
- `ToastProvider` + `AudioMuteProvider` mounted at root.
- `EmptyState` component standardizes the "no friends / no battles" shell.

## Middleware (`src/middleware.ts`)

Edge-runtime JWT verify only (uses `auth.config.ts`, no Prisma imports).
Public paths: `/login`, `/signup`, `/api/auth/*`, static assets. Everything
else redirects to `/login?callbackUrl=…`.

## What's built

- ✅ Auth (credentials + JWT + optional OAuth) + middleware gating
- ✅ Session-aware AppShell with real data
- ✅ Leaderboard GLOBAL / WEEKLY / FRIENDS tabs + back button +
  `showOnLeaderboard` filter
- ✅ Rooms CRUD (create / join / leave / quick / start / ready / submit /
  vote) with server-authoritative phases
- ✅ Battle settlement (placement, XP, coins, level, tier, streak, wins,
  BattleResult rows)
- ✅ Badge catalog + auto-award + notification
- ✅ Shop with per-pack sample list + detail modal + transactional purchase
- ✅ Friends: request / accept / decline / unfriend / suggestions
- ✅ Notifications with typed actions (friend accept, room join)
- ✅ Presence via `lastSeenAt` + zombie-room cleanup
- ✅ Settings: profile (initials + bio) / privacy toggles / linked accounts
- ✅ Privacy enforcement across friend / leaderboard / suggestions paths
- ✅ Fully English UI (no Turkish strings remain)

## What's pending

- **Audio upload + waveform playback** (S3/R2 or Supabase Storage +
  wavesurfer.js). Architectural decision first — pick storage, bucket, upload
  policy. Only THEN code.
- **Invite friend to specific room** from FriendsPanel (UI + new API to
  generate INVITE notifications organically).
- **Multiplayer browse list** page — currently only Quick / Create /
  Join-by-code.
- **`loading.tsx` / `error.tsx`** skeleton + error boundaries per route (some
  in progress via other tooling).
- **Rate limiting** on POST endpoints (friend request spam, vote abuse, buy
  replay).
- **Settings extras**: email, password change, delete account, avatar upload.
- **Featured rooms** — `Room.featured` is in schema + sort but no UI to set.
- **Cron-driven cleanup** — current cleanup is opportunistic; a real cron would
  be steadier.

## How to run

```bash
pnpm install
# fill in .env.local with DATABASE_URL + AUTH_SECRET
pnpm prisma migrate deploy
pnpm prisma db seed        # idempotent
pnpm dev                   # http://localhost:3000
```

Useful:

```bash
pnpm prisma studio                         # DB browser
pnpm prisma db seed                        # reseed (upserts — safe)
pnpm prisma migrate dev --create-only ...  # review migration before applying
pnpm tsc --noEmit                          # typecheck the full project
```

Dev-only login shortcuts (from seed):

- `producer` / `producer` — the main demo user
- `beatsmith`, `drumgod`, `808queen`, `trapzen`, `lofiking`, `vinyloop`,
  `bassface`, `synthwave` — each user's password equals their username.

## Conventions

- All user-facing copy is **English only**.
- `server-only` is imported at the top of any module that must never be
  bundled into client components (`src/lib/prisma.ts`, `src/lib/queries.ts`,
  `src/lib/battle.ts`, `src/lib/badges.ts`, `src/lib/notifications.ts`).
- Client pages that need state put `"use client"` on a child component, not
  the page itself, so `<AppShell>` (async server) can wrap them.
- Notification messages use `**word**` markers — no HTML.
- New POST routes should validate input with Zod and return the shape
  `{ ok: true, … }` on success or `{ error: "…" }` with an appropriate status.
- Privacy-sensitive queries filter by the relevant User flag
  (`showOnLeaderboard`, `discoverable`, `acceptFriendRequests`).

## File map

```
src/
  app/
    api/               42 route handlers (see list above)
    login/ signup/     credentials flow + OAuth buttons
    leaderboard/       server page, 3 tabs
    shop/              server page + ShopGrid + PackDetailModal
    profile/           server page
    settings/          server page + ProfileForm / PrivacyToggles / LinkedAccounts
    play/
      quick/ multiplayer/{create,join}/ room/[code]/
    layout.tsx         root fonts + PresencePing + ToastProvider + AudioMuteProvider
    page.tsx           home
  components/
    AppShell.tsx       async server shell
    BrandPlate.tsx     top-left branding + counters + notif bell
    UserCard.tsx       top-right avatar with dropdown
    FriendsPanel.tsx   left side — online/offline friends
    RoomsPanel.tsx     right side — public rooms
    Sketch.tsx         hand-drawn wrapper (uses SketchDefs filters)
    SketchDefs.tsx     SVG displacement filters
    Modal.tsx          shared overlay
    NotificationsModal.tsx
    AddFriendModal.tsx
    PresencePing.tsx   30s heartbeat
    Mascot.tsx
    EmptyState.tsx     standardized empty state
    Toast.tsx          toast provider
    AudioMute.tsx      audio mute provider
  lib/
    prisma.ts          PrismaPg adapter singleton
    session.ts         getCurrentUser / requireUser
    game.ts            XP/level/tier/rewards/sample pool/placement
    battle.ts          phase machine + settlement
    badges.ts          award triggers
    queries.ts         UI-shaped aggregates
    roomCleanup.ts     zombie-room sweeper
    notifications.ts   createNotification helper
    auth-actions.ts    logout server action
  auth.ts              full NextAuth config (providers + adapter)
  auth.config.ts       edge-safe subset (middleware)
  middleware.ts        route protection
  types/next-auth.d.ts session.user augmentation

prisma/
  schema.prisma
  migrations/
  seed.ts              users + packs + samples + badges + producer notifications
prisma.config.ts       Prisma 7 config file (datasource URL lives here)
```
