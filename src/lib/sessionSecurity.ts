import "server-only";

import { NextResponse } from "next/server";
import { REAUTH_REQUIRED_CODE } from "./authConstants";

export const RECENT_AUTH_WINDOW_MS = 15 * 60_000;

export function isRecentAuth(authenticatedAt: unknown): authenticatedAt is number {
  return (
    typeof authenticatedAt === "number" &&
    Number.isFinite(authenticatedAt) &&
    Date.now() - authenticatedAt <= RECENT_AUTH_WINDOW_MS
  );
}

export function reauthRequiredResponse() {
  return NextResponse.json(
    { error: "reauth required", code: REAUTH_REQUIRED_CODE },
    { status: 403 },
  );
}
