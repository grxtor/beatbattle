"use client";

import { useCallback, useEffect, useRef } from "react";
import styles from "./layoutSplitter.module.css";

type Props = {
  /** Current width (px) of the panel this splitter controls. */
  value: number;
  /** Min/max bounds for the controlled width. */
  min: number;
  max: number;
  /** Direction the splitter pulls: 'left' shrinks toward the left edge,
      'right' shrinks toward the right edge. Determines drag math sign. */
  edge: "left" | "right";
  /** Called continuously while dragging. */
  onChange: (width: number) => void;
  /** Called when drag finishes — caller can persist to storage here. */
  onCommit?: (width: number) => void;
  ariaLabel: string;
};

export default function LayoutSplitter({
  value,
  min,
  max,
  edge,
  onChange,
  onCommit,
  ariaLabel,
}: Props) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const lastEmitRef = useRef(value);

  // Keep latest value in a ref so the global pointermove handler reads fresh
  // bounds without us re-binding listeners on every state change.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      startWidthRef.current = valueRef.current;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startXRef.current;
        // edge='left' splitter sits to the right of the left rail — moving
        // right grows the rail. edge='right' splitter sits to the left of the
        // right rail — moving right shrinks it.
        const next =
          edge === "left"
            ? startWidthRef.current + dx
            : startWidthRef.current - dx;
        const clamped = Math.max(min, Math.min(max, next));
        if (clamped !== lastEmitRef.current) {
          lastEmitRef.current = clamped;
          onChange(clamped);
        }
      };

      const handleUp = () => {
        target.releasePointerCapture?.(e.pointerId);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
        target.removeEventListener("pointercancel", handleUp);
        onCommit?.(lastEmitRef.current);
      };

      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);
      target.addEventListener("pointercancel", handleUp);
    },
    [edge, min, max, onChange, onCommit],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const STEP = e.shiftKey ? 32 : 8;
    let next = value;
    if (e.key === "ArrowLeft") next = edge === "left" ? value - STEP : value + STEP;
    else if (e.key === "ArrowRight") next = edge === "left" ? value + STEP : value - STEP;
    else return;
    e.preventDefault();
    const clamped = Math.max(min, Math.min(max, next));
    onChange(clamped);
    onCommit?.(clamped);
  };

  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={onKeyDown}
    >
      <span className={styles.grip} aria-hidden="true" />
    </div>
  );
}
