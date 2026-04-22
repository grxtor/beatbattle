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
      label="PLAY BROKE"
      message="Couldn't open matchmaking. Try again."
    />
  );
}
