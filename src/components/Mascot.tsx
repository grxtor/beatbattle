"use client";

/**
 * Mascot — pure SVG renderer, per-part CSS animation.
 * Steam puffs + thought dots are decorative SVG ellipses revealed per-mood.
 * Hover / click on idle nudges mascot into a brief happy peek.
 * Mood changes trigger a quick squash "pop" transition.
 * First render plays an entry bounce-in.
 */

import { useContext, useEffect, useRef, useState } from "react";
import styles from "./Mascot.module.css";
import {
  MASCOT_ORIGINS,
  MASCOT_PART_ORDER,
  MASCOT_PIXELS,
  MASCOT_VIEWBOX,
  type MascotPart,
} from "./mascotPixels";
import { MascotMoodContext, type MascotMood } from "./MascotProvider";

type Props = {
  scale?: number;
  shadow?: boolean;
  animated?: boolean;
  mood?: MascotMood;
  className?: string;
  /** Hover/click to nudge the idle mascot into a happy peek. Default true. */
  interactive?: boolean;
};

const BASE = 230;

const PART_CLASS: Record<MascotPart, string> = {
  body: styles.body,
  leftArm: styles.leftArm,
  rightArm: styles.rightArm,
  leftLeg: styles.leftLeg,
  rightLeg: styles.rightLeg,
  stem: styles.stem,
  leaf: styles.leaf,
  leftEye: styles.leftEye,
  rightEye: styles.rightEye,
  leftEyeClosed: styles.leftEyeClosed,
  rightEyeClosed: styles.rightEyeClosed,
  eyeSparkleLeft: styles.eyeSparkleLeft,
  eyeSparkleRight: styles.eyeSparkleRight,
  leftBrow: styles.leftBrow,
  rightBrow: styles.rightBrow,
  leftBlush: styles.leftBlush,
  rightBlush: styles.rightBlush,
  mouth: styles.mouth,
  mouthHappy: styles.mouthHappy,
  mouthFrown: styles.mouthFrown,
};

/** Steam puff definitions — three puffs with staggered animation delays. */
const STEAM_PUFFS = [
  { cx: 46, cy: 10, rx: 4, ry: 3, delay: "0s" },
  { cx: 82, cy: 8,  rx: 3.5, ry: 2.5, delay: "-0.4s" },
  { cx: 64, cy: 12, rx: 4,   ry: 3,   delay: "-0.8s" },
];

/** Thought dots — arc rising from top-right of head (thinking + loading). */
const THOUGHT_DOTS = [
  { cx: 92,  cy: 14, rx: 2,   ry: 2,   delay: "0s"    },
  { cx: 101, cy: 10, rx: 2.4, ry: 2.4, delay: "0.15s" },
  { cx: 112, cy: 6,  rx: 3,   ry: 3,   delay: "0.3s"  },
];

const MOOD_POP_MS = 320;
const ENTRY_DELAY_FRAMES = 2; // two RAFs — one to paint pre-mount, one to flip

/**
 * Single source of truth for which mouth(s) to render per mood.
 * Any part in this Set is painted; any mouth NOT in the set is skipped.
 * There is no "maybe render but hide via CSS" path — the mouth is simply
 * never put into the DOM in the first place.
 */
function activeMouthsFor(mood: MascotMood): ReadonlySet<MascotPart> {
  switch (mood) {
    case "idle":     return new Set(["mouth"]);        // single neutral mouth
    case "happy":    return new Set(["mouthHappy"]);
    case "peek":     return new Set(["mouthHappy"]);
    case "angry":    return new Set(["mouthFrown"]);
    case "walking":
    case "thinking":
    case "loading":  return new Set(["mouth"]);
  }
}

const MOUTH_PARTS: readonly MascotPart[] = ["mouth", "mouthHappy", "mouthFrown"];

export default function Mascot({
  scale = 1.4,
  shadow = true,
  animated = true,
  mood: moodProp,
  className,
  interactive = true,
}: Props) {
  const size = Math.round(BASE * scale);
  const ctxMood = useContext(MascotMoodContext);
  const mood: MascotMood = moodProp ?? ctxMood ?? "idle";

  // --- hover/click "peek" (idle → brief happy) ------------------------------
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- mood transition "pop" squash ----------------------------------------
  const [popping, setPopping] = useState(false);
  const prevMoodRef = useRef<MascotMood>(mood);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popRaf = useRef<number | null>(null);

  // --- entry bounce-in (first mount only) ----------------------------------
  const [mounted, setMounted] = useState(false);

  // Mount once → trigger entry transition after paint.
  useEffect(() => {
    let rafId = 0;
    let remaining = ENTRY_DELAY_FRAMES;
    const tick = () => {
      remaining--;
      if (remaining <= 0) {
        setMounted(true);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Fire a "pop" on every mood change — but not on the very first render.
  useEffect(() => {
    if (prevMoodRef.current === mood) return;
    prevMoodRef.current = mood;
    if (!animated) return;

    // Restart animation by flushing class off first, then on next frame.
    setPopping(false);
    if (popRaf.current !== null) cancelAnimationFrame(popRaf.current);
    popRaf.current = requestAnimationFrame(() => {
      setPopping(true);
    });
    if (popTimer.current) clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => {
      setPopping(false);
      popTimer.current = null;
    }, MOOD_POP_MS);
  }, [mood, animated]);

  // Cleanup timers/rafs on unmount.
  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
      if (popTimer.current) clearTimeout(popTimer.current);
      if (popRaf.current !== null) cancelAnimationFrame(popRaf.current);
    };
  }, []);

  // Peek only overrides when we're currently idle. Other moods take priority.
  const canPeek = animated && interactive && mood === "idle";
  const effectiveMood: MascotMood = canPeek && peek ? "happy" : mood;

  const handleEnter = () => {
    if (!canPeek) return;
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(true);
  };
  const handleLeave = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), 180);
  };
  const handleClick = () => {
    if (!canPeek) return;
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(true);
    peekTimer.current = setTimeout(() => setPeek(false), 900);
  };

  const wrapperClass = [
    styles.root,
    animated ? null : styles.static,
    shadow ? styles.withShadow : null,
    mounted ? styles.mounted : null,
    popping ? styles.moodPop : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const activeMouthsForRender = activeMouthsFor(effectiveMood);

  return (
    <svg
      viewBox={`0 0 ${MASCOT_VIEWBOX.w} ${MASCOT_VIEWBOX.h}`}
      width={size}
      height={size}
      data-mood={effectiveMood}
      data-mascot-v="4"
      data-active-mouths={Array.from(activeMouthsForRender).join(",") || "none"}
      role="img"
      aria-label={`mascot ${effectiveMood}`}
      shapeRendering="crispEdges"
      className={wrapperClass}
      style={{
        overflow: "visible",
        cursor: canPeek ? "pointer" : undefined,
      }}
      onMouseEnter={canPeek ? handleEnter : undefined}
      onMouseLeave={canPeek ? handleLeave : undefined}
      onClick={canPeek ? handleClick : undefined}
    >
      {/* Steam puffs live OUTSIDE the stage group so they don't inherit the
          body bob / shake. Visible only when [data-mood="angry"]. */}
      <g className={styles.steam} aria-hidden>
        {STEAM_PUFFS.map((p, i) => (
          <ellipse
            key={i}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            fill="#d8d8d8"
            style={{ animationDelay: p.delay }}
          />
        ))}
      </g>

      {/* Thought dots — thinking + loading moods. Also outside .stage so they
          don't inherit body transforms. */}
      <g className={styles.thoughtDots} aria-hidden>
        {THOUGHT_DOTS.map((d, i) => (
          <ellipse
            key={i}
            cx={d.cx}
            cy={d.cy}
            rx={d.rx}
            ry={d.ry}
            fill="#2a180f"
            style={{ animationDelay: d.delay }}
          />
        ))}
      </g>

      <g className={styles.stage}>
        {(() => {
          const activeMouths = activeMouthsForRender;
          return MASCOT_PART_ORDER.map((part) => {
            const colorSets = MASCOT_PIXELS[part];
            if (colorSets.length === 0) return null;

            // Hard gate: mouth parts only render if they're in the active set
            // for the current mood. This is the single source of truth —
            // CSS can't un-hide what isn't in the DOM.
            if (MOUTH_PARTS.includes(part) && !activeMouths.has(part)) {
              return null;
            }

            const [ox, oy] = MASCOT_ORIGINS[part];
            return (
              <g
                key={part}
                className={PART_CLASS[part]}
                style={{ transformOrigin: `${ox}px ${oy}px` }}
              >
                {colorSets.map((cs, i) => (
                  <g key={i} fill={cs.color}>
                    {cs.runs.map(([x, y, w], j) => (
                      <rect key={j} x={x} y={y} width={w} height={1} />
                    ))}
                  </g>
                ))}
              </g>
            );
          });
        })()}
      </g>
    </svg>
  );
}
