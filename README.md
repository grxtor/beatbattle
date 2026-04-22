# Beat Battle

Multiplayer beat-production battle game. Producers join a room, get 4 random
samples, produce a track under a timer, vote blindly on each other's tracks,
and earn XP + coins based on placement. Pixel + hand-drawn aesthetic.

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: PostgreSQL 18 + Prisma 7
- **Auth**: Auth.js v5 (credentials + optional Discord/Google OAuth)
- **Cache / rate limiting**: Redis (with in-memory fallback)
- **Media**: disk-backed, nginx-aliased in prod
- **Package manager**: pnpm (hard rule — do not mix npm/yarn)

---

## Local setup

```bash
pnpm install
cp .env.example .env.local            # fill in DATABASE_URL + AUTH_SECRET (+ optional REDIS_URL)
pnpm prisma migrate deploy
pnpm prisma db seed                   # idempotent — safe to re-run
pnpm dev                              # http://localhost:3000
```

Useful scripts:

```bash
pnpm prisma studio                    # DB browser
pnpm prisma migrate dev --name foo    # new migration
pnpm tsc --noEmit                     # typecheck whole project
pnpm build                            # production build
```

Dev login shortcuts (from seed) — each user's password equals their username:
`producer`, `beatsmith`, `drumgod`, `808queen`, `trapzen`, `lofiking`,
`vinyloop`, `bassface`, `synthwave`.

---

## Self-hosted deploy (Debian 12)

The app ships as a plain Node process. Reverse-proxy via nginx, supervise
with systemd (or pm2).

### 1. Node + pnpm

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm@10
```

### 2. App user + directories

```bash
sudo adduser --system --group --home /opt/beatbattle beatbattle
sudo mkdir -p /var/lib/beatbattle/media
sudo chown -R beatbattle:beatbattle /opt/beatbattle /var/lib/beatbattle
```

### 3. Checkout + build

```bash
sudo -u beatbattle bash -lc '
  cd /opt/beatbattle
  git clone https://github.com/grxtor/beatbattle.git app
  cd app
  cp .env.example .env
  # edit .env — DATABASE_URL, AUTH_SECRET, REDIS_URL,
  #             MEDIA_ROOT=/var/lib/beatbattle/media,
  #             MEDIA_PUBLIC_BASE=/media
  pnpm install --prod=false
  pnpm prisma migrate deploy
  pnpm prisma db seed
  pnpm build
'
```

### 4. systemd unit

`/etc/systemd/system/beatbattle.service`:

```ini
[Unit]
Description=Beat Battle
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=beatbattle
Group=beatbattle
WorkingDirectory=/opt/beatbattle/app
EnvironmentFile=/opt/beatbattle/app/.env
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now beatbattle
sudo journalctl -u beatbattle -f
```

### 5. nginx + TLS

`/etc/nginx/sites-available/beatbattle`:

```nginx
server {
  listen 80;
  server_name your.domain.example;

  # Redirect plain HTTP to HTTPS (certbot adds the 443 block on first run).
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name your.domain.example;

  # managed by certbot after `sudo certbot --nginx`
  # ssl_certificate …
  # ssl_certificate_key …

  client_max_body_size 35m;        # track upload is capped at 30 MB

  # Serve media bytes straight from disk — bypass Node for uploads + samples.
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
}
```

```bash
sudo ln -s /etc/nginx/sites-available/beatbattle /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your.domain.example
```

### 6. Sample library

Drop pack audio files under `MEDIA_ROOT/samples/<pack-slug>/<sample-slug>.mp3`.
Slugs are lower-case, non-alphanumerics collapsed to single dashes — e.g.
`trap-essentials/808-kick.mp3`, `lo-fi-vinyl/rhodes-chord.mp3`.

The seed only sets the URL; the file has to exist on disk. Missing files
return 404 and the shop preview button grey-outs itself automatically.

---

## Directory layout

```
/opt/beatbattle/app/           # repo checkout
/var/lib/beatbattle/media/     # persistent uploads + samples (nginx alias)
  ├── tracks/<roomId>/<trackId>.<rand>.mp3
  └── samples/<pack-slug>/<sample-slug>.mp3
```

---

## Project conventions

See `CLAUDE.md` for the full guide. The big ones:

- **pnpm only** — no npm / yarn / mixed lockfiles.
- **Next 16 breaking changes** — `params` is `Promise`, `RouteContext` is a
  global type, `fetch` isn't cached by default. Read
  `node_modules/next/dist/docs/` before writing routes.
- **Server modules import `server-only`** so they can't be bundled client-side.
- **Rate limit every POST** via `rateLimit()` — presets live in
  `src/lib/rateLimit.ts`.
- **Race-safe mutations** in `src/lib/battle.ts` and room routes use
  `FOR UPDATE` locks and `updateMany` compare-and-set guards.
- **All user copy in English** — no Turkish strings in UI.

---

## Running tests

There aren't any yet. Roadmap: pick Vitest + a Testcontainers Postgres for
`lib/battle.ts` + `lib/game.ts` + the vote/settle flows.
