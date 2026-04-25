"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type MascotMood =
  | "idle"
  | "happy"
  | "angry"
  | "walking"
  | "thinking"
  | "loading"
  | "peek";

export const MASCOT_MOODS: readonly MascotMood[] = [
  "idle",
  "happy",
  "angry",
  "walking",
  "thinking",
  "loading",
  "peek",
] as const;

type MascotContextValue = {
  mood: MascotMood;
  setMood: (mood: MascotMood) => void;
  play: (mood: MascotMood, durationMs?: number) => void;
};

export const MascotMoodContext = createContext<MascotMood>("idle");
const MascotApiContext = createContext<Omit<
  MascotContextValue,
  "mood"
> | null>(null);

export function useMascot(): MascotContextValue {
  const api = useContext(MascotApiContext);
  const mood = useContext(MascotMoodContext);
  if (!api) throw new Error("useMascot must be used inside <MascotProvider>");
  return { mood, ...api };
}

export default function MascotProvider({
  children,
  initialMood = "idle",
}: {
  children: React.ReactNode;
  initialMood?: MascotMood;
}) {
  const [mood, setMoodState] = useState<MascotMood>(initialMood);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMood = useCallback((next: MascotMood) => {
    if (revertTimer.current) {
      clearTimeout(revertTimer.current);
      revertTimer.current = null;
    }
    setMoodState(next);
  }, []);

  const play = useCallback((next: MascotMood, durationMs = 2500) => {
    if (revertTimer.current) clearTimeout(revertTimer.current);
    setMoodState(next);
    revertTimer.current = setTimeout(() => {
      setMoodState("idle");
      revertTimer.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  const api = useMemo(() => ({ setMood, play }), [setMood, play]);

  // Expose a tiny browser-console command surface:
  //   mascot.angry()   mascot.happy()   mascot.play('walking', 3000)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const surface: Record<string, unknown> = {
      setMood,
      play,
      get mood() {
        return mood;
      },
    };
    for (const m of MASCOT_MOODS) {
      surface[m] = () => setMood(m);
    }
    (window as unknown as { mascot?: unknown }).mascot = surface;
  }, [mood, setMood, play]);

  return (
    <MascotApiContext.Provider value={api}>
      <MascotMoodContext.Provider value={mood}>
        {children}
      </MascotMoodContext.Provider>
    </MascotApiContext.Provider>
  );
}
