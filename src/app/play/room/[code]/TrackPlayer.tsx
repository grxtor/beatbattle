"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { useAudioMute } from "@/components/AudioMute";
import styles from "./trackPlayer.module.css";

type Props = {
  src: string | null;
  label?: string;
  /** Reset playback when this value changes (e.g. switching tracks). */
  resetKey?: string;
};

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export default function TrackPlayer({ src, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const { muted } = useAudioMute();
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState(false);

  // Initialise / re-initialise wavesurfer when src changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) {
      // Tear down if a previous instance exists but src is now null.
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
      setPlaying(false);
      setCurrent(0);
      setDuration(0);
      setReady(false);
      setErrored(false);
      return;
    }

    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setReady(false);
    setErrored(false);

    const styleVars = getComputedStyle(container);
    const accent = styleVars.getPropertyValue("--accent").trim() || "#ff7a1a";
    const dim = styleVars.getPropertyValue("--line-hi").trim() || "#3a2618";

    const ws = WaveSurfer.create({
      container,
      url: src,
      waveColor: dim,
      progressColor: accent,
      cursorColor: accent,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 2,
      barRadius: 0,
      height: 80,
      normalize: true,
      interact: true,
      dragToSeek: true,
    });
    ws.setMuted(muted);

    ws.on("ready", () => {
      setReady(true);
      setDuration(ws.getDuration());
    });
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    ws.on("timeupdate", (t) => setCurrent(t));
    ws.on("error", () => setErrored(true));

    wsRef.current = ws;
    return () => {
      ws.destroy();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [src, resetKey, muted]);

  // Apply mute changes without rebuilding the instance.
  useEffect(() => {
    wsRef.current?.setMuted(muted);
  }, [muted]);

  const toggle = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !src || errored) return;
    void ws.playPause();
  }, [src, errored]);

  return (
    <div className={styles.wrap}>
      <div
        ref={containerRef}
        className={`${styles.waveform} ${!src ? styles.noSrc : ""}`}
        aria-label="Track waveform"
      />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={toggle}
          disabled={!src || errored || !ready}
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
            : !ready
            ? "LOADING…"
            : playing
            ? "PLAYING"
            : "READY"}
        </span>
      </div>
    </div>
  );
}
