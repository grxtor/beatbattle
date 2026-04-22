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
      label="ROOM DROPPED"
      variant={1}
      message="Lost the room connection. You can rejoin or head home."
    />
  );
}
