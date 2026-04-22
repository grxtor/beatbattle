"use client";

import { useEffect } from "react";

/** 30sn'de bir presence ping atar. Pencere gizliyken durur. */
export default function PresencePing() {
  useEffect(() => {
    let stopped = false;

    const ping = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        await fetch("/api/presence", { method: "POST", credentials: "same-origin" });
      } catch {
        /* offline? ignore */
      }
    };

    ping();
    const id = setInterval(ping, 30_000);

    const onVisible = () => { if (document.visibilityState === "visible") void ping(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
