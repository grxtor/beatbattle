import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle under .next/standalone — the
  // Dockerfile runner stage copies that + .next/static + public + prisma,
  // and nothing else. Keeps the final image lean.
  output: "standalone",

  // Prisma (and its pg adapter) ship native engine files that don't survive
  // webpack bundling on the server — mark them external so they're imported
  // from node_modules at runtime instead.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "ioredis",
  ],
};

export default nextConfig;
