"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
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
            {pack.sampleList.map((s) => (
              <div key={s.id} className={styles.modalSampleRow}>
                <button
                  type="button"
                  className={styles.modalSamplePlay}
                  onClick={() => setPlayingId(playingId === s.id ? null : s.id)}
                  title={s.audioUrl ? "play" : "no audio yet"}
                  disabled={!s.audioUrl}
                >
                  {playingId === s.id ? "■" : "▸"}
                </button>
                <span className={styles.modalSampleName}>{s.name}</span>
                <span className={styles.modalSampleDur}>{s.duration}</span>
              </div>
            ))}
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
    </Modal>
  );
}
