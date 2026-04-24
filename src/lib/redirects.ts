const DEFAULT_REDIRECT = "/";

function normalizeOrigin(rawOrigin: string | undefined): string | null {
  if (!rawOrigin) return null;
  try {
    return new URL(rawOrigin).origin;
  } catch {
    return null;
  }
}

export function sanitizeRedirectTarget(
  rawTarget: string | null | undefined,
  currentOrigin?: string,
): string {
  const candidate = rawTarget?.trim();
  if (!candidate) return DEFAULT_REDIRECT;

  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  const allowedOrigin = normalizeOrigin(currentOrigin);
  if (!allowedOrigin) return DEFAULT_REDIRECT;

  try {
    const parsed = new URL(candidate);
    if (parsed.origin !== allowedOrigin) return DEFAULT_REDIRECT;

    const relativeTarget = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return relativeTarget.startsWith("/") ? relativeTarget : DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
}
