"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          margin: 0,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#111",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: "100%",
            padding: "28px 24px",
            border: "3px solid #111",
            textAlign: "center",
            background: "#fff",
          }}
        >
          <h1 style={{ fontSize: 18, letterSpacing: 2, margin: "0 0 10px" }}>
            BEAT BATTLE CRASHED
          </h1>
          <p style={{ margin: "0 0 16px", lineHeight: 1.4 }}>
            Something went wrong at the root. Try reloading — if it keeps
            happening, this one&apos;s on us.
          </p>
          {error.digest ? (
            <code
              style={{
                display: "block",
                fontSize: 11,
                opacity: 0.6,
                marginBottom: 16,
                wordBreak: "break-all",
              }}
            >
              ref: {error.digest}
            </code>
          ) : null}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              padding: "10px 18px",
              border: "2px solid #111",
              background: "#ffeb3b",
              cursor: "pointer",
              fontWeight: 700,
              letterSpacing: 1.5,
            }}
          >
            TRY AGAIN
          </button>
        </div>
      </body>
    </html>
  );
}
