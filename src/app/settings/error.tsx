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
      label="SETTINGS BROKE"
      variant={2}
      message="Couldn't load settings. Nothing was saved."
    />
  );
}
