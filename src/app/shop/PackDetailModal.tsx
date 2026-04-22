"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useAudioMute } from "@/components/AudioMute";
import styles from "./page.module.css";

type Sample = { id: string; name: string; duration: string; audioUrl: string | null };

type PackDetail = {
  pack: {
    id: number;
    name: string;
    genre: string;
    samples: number;
    price: number;
    icon: string;
    unlockLvl: number | null;
    description: string | null;
    sampleList: Sample[];
  };
  owned: boolean;
};

type Props = {
  packId: number;
  open: boolean;
  onClose: () => void;
  onBuy?: (id: number) => Promise<void>;
  userLevel: number;
  userCoins: number;
  buying?: boolean;
};

function genreDisplay(g: string) {
  if (g === "LOFI") return "LO-FI";
  if (g === "HIPHOP") return "HIP-HOP";
  return g;
}

export default function PackDetailModal({
  packId,
  open,
  onClose,
  onBuy,
  userLevel,
  userCoins,
  buying,
}: Props) {
  const [data, setData] = useState<PackDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { muted } = useAudioMute();

  // Stop playback whenever the modal closes so audio doesn't keep going in
  // the background after the user dismisses the dialog.
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlayingId(null);
    }
  }, [open]);

  const playSample = useCallback(
    (sample: Sample) => {
      if (!sample.audioUrl || unavailable.has(sample.id)) return;
      const audio = audioRef.current;
      if (!audio) return;
      if (playingId === sample.id) {
        audio.pause();
        setPlayingId(null);
        return;
      }
      audio.src = sample.audioUrl;
      audio.muted = muted;
      audio.currentTime = 0;
      audio
        .play()
        .then(() => setPlayingId(sample.id))
        .catch(() => {
          setUnavailable((s) => new Set(s).add(sample.id));
          setPlayingId(null);
        });
    },
    [muted, playingId, unavailable],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/${packId}`, { cache: "no-store" });
      if (res.ok) {
        setData((await res.json()) as PackDetail);
      }
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const pack = data?.pack;
  const locked = !!pack?.unlockLvl && userLevel < pack.unlockLvl;
  const canAfford = pack ? userCoins >= pack.price : false;

  return (
    <Modal open={open} onClose={onClose} title={pack?.name ?? "PACK"} variant={1}>
      {loading && !pack ? (
        <div className={styles.modalLoading}>LOADING…</div>
      ) : pack ? (
        <div className={styles.modalBody}>
          <div className={styles.modalHead}>
            <div className={styles.modalIcon}>{pack.icon}</div>
            <div className={styles.modalHeadText}>
              <div className={styles.modalMeta}>
                <b>{pack.samples}</b> SAMPLES · <b>{genreDisplay(pack.genre)}</b>
              </div>
              {pack.description && (
                <p className={styles.modalDesc}>{pack.description}</p>
              )}
            </div>
          </div>

          <div className={styles.modalSampleLbl}>SAMPLES</div>
          <div className={styles.modalSamples}>
            {pack.sampleList.length === 0 && (
              <div className={styles.modalLoading}>NO SAMPLES LISTED</div>
            )}
            {pack.sampleList.map((s) => {
              const broken = unavailable.has(s.id);
              const disabled = !s.audioUrl || broken;
              return (
                <div key={s.id} className={styles.modalSampleRow}>
                  <button
                    type="button"
                    className={styles.modalSamplePlay}
                    onClick={() => playSample(s)}
                    title={
                      broken
                        ? "preview unavailable"
                        : s.audioUrl
                        ? "play preview"
                        : "no audio yet"
                    }
                    disabled={disabled}
                  >
                    {playingId === s.id ? "■" : "▸"}
                  </button>
                  <span className={styles.modalSampleName}>{s.name}</span>
                  <span className={styles.modalSampleDur}>{s.duration}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.modalFoot}>
            <div className={styles.modalPrice}>
              {pack.price === 0 ? "FREE" : `${pack.price.toLocaleString()} COINS`}
            </div>
            {data.owned ? (
              <div className={styles.modalOwned}>✓ OWNED</div>
            ) : locked ? (
              <button className={styles.modalBuyBtn} disabled>
                LVL {pack.unlockLvl} REQUIRED
              </button>
            ) : (
              <button
                className={styles.modalBuyBtn}
                disabled={!canAfford || buying}
                onClick={() => onBuy?.(pack.id)}
              >
                {buying ? "…" : !canAfford ? "NOT ENOUGH COINS" : pack.price === 0 ? "CLAIM →" : "BUY →"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.modalLoading}>NOT FOUND</div>
      )}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => setPlayingId(null)}
      />
    </Modal>
  );
}
