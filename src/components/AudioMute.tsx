"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type AudioCtx = {
  muted: boolean;
  toggle: () => void;
  setMuted: (m: boolean) => void;
};

const Ctx = createContext<AudioCtx | null>(null);

const KEY = "beatbattle.muted.v1";

export function AudioMuteProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState(false);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "1") setMutedState(true);
    } catch {
      /* ignore */
    }
  }, []);

  // apply to all <audio>/<video> elements + persist
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    const els = document.querySelectorAll("audio, video");
    els.forEach((el) => {
      (el as HTMLMediaElement).muted = muted;
    });
  }, [muted]);

  const setMuted = useCallback((m: boolean) => setMutedState(m), []);
  const toggle = useCallback(() => setMutedState((m) => !m), []);

  return (
    <Ctx.Provider value={{ muted, toggle, setMuted }}>{children}</Ctx.Provider>
  );
}

export function useAudioMute() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudioMute must be inside <AudioMuteProvider>");
  return ctx;
}
