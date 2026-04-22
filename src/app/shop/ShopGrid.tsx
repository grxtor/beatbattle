"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sketch from "@/components/Sketch";
import PackDetailModal from "./PackDetailModal";
import styles from "./page.module.css";

type Pack = {
  id: number;
  name: string;
  genre: string;
  samples: number;
  price: number;
  icon: string;
  isNew: boolean;
  unlockLvl: number | null;
  owned: boolean;
};

type ShopGridProps = {
  packs: Pack[];
  userLevel: number;
  userCurrency: number;
};

function genreDisplay(g: string) {
  if (g === "LOFI") return "LO-FI";
  if (g === "HIPHOP") return "HIP-HOP";
  return g;
}

const FILTERS = ["ALL", "TRAP", "LOFI", "HIPHOP", "HOUSE", "FX"] as const;

export default function ShopGrid({ packs, userLevel, userCurrency }: ShopGridProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [coin, setCoin] = useState(userCurrency);
  const [detailId, setDetailId] = useState<number | null>(null);

  const visible = packs.filter((p) => filter === "ALL" || p.genre === filter);

  const buy = async (packId: number) => {
    setPendingId(packId);
    setErr(null);
    try {
      const res = await fetch(`/api/shop/${packId}/buy`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; currency?: number; error?: string };
      if (!res.ok) {
        setErr(data.error ?? "purchase failed");
        return;
      }
      if (typeof data.currency === "number") setCoin(data.currency);
      setDetailId(null);
      router.refresh();
    } catch {
      setErr("connection error");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>
          SAMPLE <span>SHOP</span>
        </h1>
        <div className={styles.balance}>
          <b>{coin.toLocaleString()}</b> COINS
        </div>
      </div>

      <div className={styles.categories}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`${styles.cat} ${filter === f ? styles.catActive : ""}`}
            onClick={() => setFilter(f)}
          >
            {genreDisplay(f)}
          </button>
        ))}
      </div>

      {err && <div style={{ color: "#ff6262", fontSize: 12, marginBottom: 8 }}>{err}</div>}

      <div className={styles.grid}>
        {visible.map((p) => {
          const locked = p.unlockLvl != null && userLevel < p.unlockLvl;
          const canAfford = coin >= p.price;
          const buttonLabel = p.owned
            ? "OWNED"
            : locked
            ? "LOCKED"
            : !canAfford
            ? "NO COIN"
            : pendingId === p.id
            ? "..."
            : p.price === 0
            ? "CLAIM →"
            : "GET →";

          return (
            <Sketch
              key={p.id}
              variant={((p.id % 3) + 1) as 1 | 2 | 3}
              className={`${styles.pack} ${locked ? styles.locked : ""}`}
              onClick={() => setDetailId(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setDetailId(p.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <div className={styles.cover}>
                <span className={styles.coverIcon}>{p.icon}</span>
                {p.isNew && (
                  <span className={`${styles.badge} ${styles.badgeNew}`}>NEW</span>
                )}
                {locked && (
                  <div className={styles.lockOverlay}>LVL {p.unlockLvl}</div>
                )}
              </div>

              <div className={styles.packName}>{p.name}</div>
              <div className={styles.packMeta}>
                <b>{p.samples}</b> SAMPLES · <b>{genreDisplay(p.genre)}</b>
              </div>

              <div className={styles.packFoot}>
                <span className={`${styles.price} ${p.price === 0 ? styles.priceFree : ""}`}>
                  {p.price === 0 ? "FREE" : `${p.price} ¢`}
                </span>
                <button
                  className={styles.buyBtn}
                  disabled={p.owned || locked || !canAfford || pendingId === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void buy(p.id);
                  }}
                >
                  {buttonLabel}
                </button>
              </div>
            </Sketch>
          );
        })}
      </div>

      {detailId != null && (
        <PackDetailModal
          packId={detailId}
          open={detailId != null}
          onClose={() => setDetailId(null)}
          onBuy={buy}
          userLevel={userLevel}
          userCoins={coin}
          buying={pendingId === detailId}
        />
      )}
    </>
  );
}
