#!/usr/bin/env node

if (process.env.NODE_ENV !== "production") {
  process.exit(0);
}

const authUrl = process.env.AUTH_URL;
if (!authUrl) {
  console.error("[env] AUTH_URL is required when NODE_ENV=production.");
  process.exit(1);
}

try {
  const parsed = new URL(authUrl);
  const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
  const hasOriginOnly =
    (parsed.pathname === "" || parsed.pathname === "/") &&
    !parsed.search &&
    !parsed.hash;

  if (!isHttp || !parsed.hostname || !hasOriginOnly) {
    throw new Error("AUTH_URL must be an origin like https://beatbattle.example");
  }
} catch (error) {
  const message =
    error instanceof Error ? error.message : "failed to parse AUTH_URL";
  console.error(`[env] Invalid AUTH_URL: ${message}`);
  process.exit(1);
}
