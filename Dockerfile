# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js 16 + Prisma 7.
#
#  - deps   : install all node_modules (prod + dev) with pnpm
#  - build  : prisma generate + next build (produces .next/standalone)
#  - runner : tiny alpine image with only the standalone server + prisma bits
#
# Build:   docker build -t beatbattle:latest .
# Run:     docker run --env-file .env -p 3000:3000 -v /var/lib/beatbattle/media:/media beatbattle:latest

ARG NODE_VERSION=22-alpine

# ---------- deps ----------
FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# prisma postinstall needs schema to generate; copy before install.
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM node:${NODE_VERSION} AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm prisma generate
# `next typegen` isn't required for build but it makes the route type errors
# show up here instead of at runtime.
RUN pnpm exec next typegen
RUN pnpm build

# Bundle the seed to a standalone CJS so the slim runner image can execute
# it with plain `node`, no tsx / dev deps needed at runtime.
RUN pnpm exec esbuild prisma/seed.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --outfile=prisma/seed.cjs \
    --external:@prisma/client \
    --external:@prisma/adapter-pg \
    --external:bcryptjs \
    --external:dotenv \
    --external:pg

# ---------- runner ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    MEDIA_ROOT=/media \
    MEDIA_PUBLIC_BASE=/media

# Non-root user; same UID as the `node` user on Debian hosts so bind-mounted
# /media permissions line up without extra chmod dances.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs beatbattle

# Standalone bundle already contains a server.js + its own slimmed
# node_modules. We still need static assets + public/ + prisma schema/engines
# copied in alongside.
COPY --from=build --chown=beatbattle:nodejs /app/.next/standalone ./
COPY --from=build --chown=beatbattle:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=beatbattle:nodejs /app/public ./public

# Prisma: CLI binary + schema + migrations + query engine. `migrate deploy`
# is run at container start by docker-entrypoint.sh. `prisma/seed.cjs` is
# the esbuild-bundled seed script.
COPY --from=build --chown=beatbattle:nodejs /app/prisma ./prisma
COPY --from=build --chown=beatbattle:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=beatbattle:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# Packages the bundled seed imports externally — these must exist in the
# standalone node_modules tree (Next already pulls them in because they're
# used by the app too, but listing here makes the dependency explicit).
COPY --from=build --chown=beatbattle:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=build --chown=beatbattle:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=build --chown=beatbattle:nodejs /app/node_modules/pg ./node_modules/pg

# Entrypoint runs prisma migrate deploy, then exec's the Next server.
COPY --chown=beatbattle:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Persistent media (uploaded tracks + samples). In prod bind-mount this to
# /var/lib/beatbattle/media on the host.
RUN mkdir -p /media && chown -R beatbattle:nodejs /media
VOLUME ["/media"]

USER beatbattle
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/presence').then(r=>process.exit(r.status===401||r.status===200?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
