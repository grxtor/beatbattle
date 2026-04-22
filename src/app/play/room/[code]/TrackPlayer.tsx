"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioMute } from "@/components/AudioMute";
import styles from "./trackPlayer.module.css";

type Props = {
  src: string | null;
  label?: string;
  /** Reset playback when this value changes (e.g. switching tracks). */
  resetKey?: string;
};

const BAR_COUNT = 40;

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicBars(src: string): number[] {
  // Stable per-track bars so the same URL always renders the same silhouette.
  // Replace with real waveform analysis once we pipe audio through a worker.
  const s = seed(src);
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const n = Math.sin(i * 12.9898 + s * 0.0001) * 43758.5453;
    const frac = n - Math.floor(n);
    bars.push(0.25 + frac * 0.75);
  }
  return bars;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export default function TrackPlayer({ src, label, resetKey }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { muted } = useAudioMute();
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState(false);

  // Deterministic silhouette per src.
  const bars = src ? deterministicBars(src) : deterministicBars(label ?? "empty");

  // Pause + reset on track switch / src change.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setCurrent(0);
    setReady(false);
    setErrored(false);
  }, [src, resetKey]);

  // Apply muted state (on mount before the global effect runs).
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = muted;
  }, [muted]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      audio.play().catch(() => setErrored(true));
    } else {
      audio.pause();
    }
  }, [src]);

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.bars} ${!src ? styles.noSrc : ""}`}
        onClick={src ? onSeek : undefined}
        role={src ? "slider" : undefined}
        aria-label="Track progress"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {bars.map((h, i) => {
          const reached = (i / BAR_COUNT) * 100 <= progressPct;
          return (
            <span
              key={i}
              className={`${styles.bar} ${reached ? styles.barOn : ""} ${
                playing ? styles.barPulse : ""
              }`}
              style={{ height: `${h * 100}%`, animationDelay: `${i * 30}ms` }}
            />
          );
        })}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={toggle}
          disabled={!src || errored}
          aria-label={playing ? "Pause" : "Play"}
        >
          {errored ? "!" : playing ? "■" : "▸"}
        </button>
        <span className={styles.time}>
          {fmt(current)} <span className={styles.timeSep}>/</span>{" "}
          {ready ? fmt(duration) : "—:—"}
        </span>
        <span className={styles.status}>
          {!src
            ? "NO AUDIO"
            : errored
            ? "PLAYBACK FAILED"
            : playing
            ? "PLAYING"
            : "READY"}
        </span>
      </div>

      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            setReady(true);
          }}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
