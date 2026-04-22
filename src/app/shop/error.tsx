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
      label="SHOP OFFLINE"
      variant={3}
      message="The shop failed to load. Your coins are safe."
    />
  );
}
