import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an adapter. Avoid duplicated clients during Next.js HMR
// by caching onto globalThis in development.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL missing — check .env.local.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createClient();
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Proxy that defers client construction until the first property access.
 *
 * Next.js runs a "collect page data" phase during `next build` that imports
 * every server module — if this file instantiated PrismaClient at import
 * time, a Docker build with no DATABASE_URL at layer-build time would fail
 * loudly. The Proxy lets the module import cleanly and only connects when
 * actually called (at request time, where env vars are set).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
