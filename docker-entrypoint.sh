#!/bin/sh
set -eu

# Run outstanding migrations every boot. Idempotent — if the DB is already
# up-to-date this is a no-op. Skips when SKIP_MIGRATE=1 is set (useful for
# side-car containers that share the same DB).
if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] prisma migrate deploy"
  node node_modules/prisma/build/index.js migrate deploy
fi

# Optional: reseed when SEED_ON_BOOT=1. Seed is idempotent (upserts) so
# running it on every boot is safe, but we leave it opt-in because it
# touches rows and adds to boot latency. The seed script is an esbuild-
# bundled CJS so it runs with plain node — no tsx / dev deps needed.
if [ "${SEED_ON_BOOT:-0}" = "1" ]; then
  echo "[entrypoint] running bundled seed"
  node prisma/seed.cjs || echo "[entrypoint] seed skipped/failed"
fi

echo "[entrypoint] starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
