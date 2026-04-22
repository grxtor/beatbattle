"use client";

import ErrorShell from "@/components/ErrorShell";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorShell
      error={error}
      retry={unstable_retry}
      label="LEADERBOARD BROKE"
      variant={2}
      message="Couldn't load the leaderboard. Give it another shot."
    />
  );
}
