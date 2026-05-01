"use client";

import { useEffect, useRef, useState } from "react";
import Mascot from "@/components/Mascot";
import type { MascotMood } from "@/components/MascotProvider";
import styles from "./wanderingMascot.module.css";

/**
 * Floating mascot that wanders around the bottom edge of the viewport.
 *
 * Picks a random destination every few seconds, walks toward it via a CSS
 * transform transition, then idles. Drives the shared mascot mood so the
 * pose flips between "walking" and "idle" automatically.
 *
 * Click the mascot to make it skip ahead to a new spot, or it'll just stand
 * around until the next tick.
 */

const STEP_MIN_MS = 6_000;
const STEP_MAX_MS = 11_000;
const TRAVEL_MIN_MS = 2_500;
const TRAVEL_MAX_MS = 4_500;
const MASCOT_PX = 110;
const SAFE_BOTTOM_PX = 24;
const SAFE_SIDE_PX = 32;

type Pos = { x: number; y: number; flip: boolean };

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function pickPos(prev: Pos, vw: number, vh: number): Pos {
  // Wander along the lower third of the viewport so the mascot doesn't cover
  // the main play area.
  const minX = SAFE_SIDE_PX;
  const maxX = Math.max(minX + 1, vw - MASCOT_PX - SAFE_SIDE_PX);
  const lowY = Math.max(0, vh * 0.55);
  const minY = lowY;
  const maxY = Math.max(lowY + 1, vh - MASCOT_PX - SAFE_BOTTOM_PX);
  const x = randInt(minX, maxX);
  const y = randInt(minY, maxY);
  return { x, y, flip: x < prev.x };
}

export default function WanderingMascot() {
  const [pos, setPos] = useState<Pos>(() => ({ x: 40, y: 600, flip: false }));
  const [travelMs, setTravelMs] = useState(3_000);
  // Local mood for the wanderer — keeps walking/idle isolated from any other
  // mascot rendered elsewhere by MascotProvider.
  const [mood, setMood] = useState<MascotMood>("idle");
  const moodResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate to a real position once we know the viewport.
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos((p) => ({ ...p, x: Math.min(p.x, vw - MASCOT_PX - SAFE_SIDE_PX), y: vh - MASCOT_PX - SAFE_BOTTOM_PX }));
  }, []);

  // Wander loop: pick a destination → walk → idle → repeat.
  useEffect(() => {
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tMs = randInt(TRAVEL_MIN_MS, TRAVEL_MAX_MS);
      setTravelMs(tMs);
      setPos((prev) => pickPos(prev, vw, vh));
      setMood("walking");

      // After the travel transition completes, drop back to idle.
      idleTimer.current = setTimeout(() => {
        if (cancelled) return;
        setMood("idle");
      }, tMs + 50);

      tickTimer.current = setTimeout(step, tMs + randInt(STEP_MIN_MS, STEP_MAX_MS));
    };

    // First step shortly after mount.
    tickTimer.current = setTimeout(step, 1_500);

    return () => {
      cancelled = true;
      if (tickTimer.current) clearTimeout(tickTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  // React to viewport resize so the mascot doesn't end up off-screen.
  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos((p) => ({
        x: Math.min(p.x, vw - MASCOT_PX - SAFE_SIDE_PX),
        y: Math.min(p.y, vh - MASCOT_PX - SAFE_BOTTOM_PX),
        flip: p.flip,
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onClick = () => {
    if (moodResetRef.current) clearTimeout(moodResetRef.current);
    setMood("happy");
    moodResetRef.current = setTimeout(() => setMood("idle"), 1_500);
  };

  useEffect(() => {
    return () => {
      if (moodResetRef.current) clearTimeout(moodResetRef.current);
    };
  }, []);

  return (
    <div
      className={styles.wrap}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scaleX(${pos.flip ? -1 : 1})`,
        transition: `transform ${travelMs}ms cubic-bezier(.45,.05,.55,.95)`,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Mascot — click to greet"
    >
      <Mascot scale={0.45} interactive={false} mood={mood} />
    </div>
  );
}
