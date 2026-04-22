"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sketch from "@/components/Sketch";
import styles from "./page.module.css";

const LENGTHS = ["15M", "20M", "30M", "60M"] as const;
const MAX_PLAYERS = [2, 4, 8, 16] as const;
const PRIVACY = ["PUBLIC", "PRIVATE"] as const;
// UI label → API enum
const GENRES = ["TRAP", "LO-FI", "HIP-HOP", "HOUSE", "FX", "RANDOM"] as const;
const DIFFICULTY = ["EASY", "MEDIUM", "HARD"] as const;

function genreToApi(g: (typeof GENRES)[number]): string {
  if (g === "LO-FI") return "LOFI";
  if (g === "HIP-HOP") return "HIPHOP";
  return g;
}
function lengthToMin(l: (typeof LENGTHS)[number]): number {
  return parseInt(l.replace("M", ""), 10);
}

export default function CreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("20M");
  const [max, setMax] = useState<(typeof MAX_PLAYERS)[number]>(8);
  const [privacy, setPrivacy] = useState<(typeof PRIVACY)[number]>("PUBLIC");
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("TRAP");
  const [diff, setDiff] = useState<(typeof DIFFICULTY)[number]>("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          genre: genreToApi(genre),
          lengthMin: lengthToMin(length),
          maxPlayers: max,
          difficulty: diff,
          privacy,
        }),
      });
      const data = (await res.json()) as { room?: { code: string }; error?: string };
      if (!res.ok || !data.room) {
        setErr(data.error ?? "couldn't create room");
        return;
      }
      router.push(`/play/room/${data.room.code}`);
    } catch {
      setErr("connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sketch variant={1} className={styles.wrap}>
        <div className={styles.scroll}>
        <Link href="/play/multiplayer" className={styles.backLink}>
          ← BACK
        </Link>

        <div className={styles.header}>
          <h1 className={styles.title}>
            CREATE <span>ROOM</span>
          </h1>
          <button
            type="submit"
            form="create-room-form"
            className={styles.headerSubmit}
            disabled={submitting}
          >
            {submitting ? "..." : "CREATE ROOM →"}
          </button>
          <p className={styles.sub}>
            {err ?? "Set your rules. You'll get a 6-digit code to share."}
          </p>
        </div>

        <form id="create-room-form" className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <span className={styles.label}>
              ROOM NAME <b>· shown in the lobby</b>
            </span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trap Kings, Lo-Fi Chill..."
              maxLength={30}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>
              LENGTH <b>· production time</b>
            </span>
            <div className={styles.chips}>
              {LENGTHS.map((v) => (
                <button
                  type="button"
                  key={v}
                  className={`${styles.chip} ${
                    length === v ? styles.chipActive : ""
                  }`}
                  onClick={() => setLength(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>
              MAX PLAYERS
            </span>
            <div className={styles.chips}>
              {MAX_PLAYERS.map((v) => (
                <button
                  type="button"
                  key={v}
                  className={`${styles.chip} ${
                    max === v ? styles.chipActive : ""
                  }`}
                  onClick={() => setMax(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>PRIVACY</span>
            <div className={styles.chips}>
              {PRIVACY.map((v) => (
                <button
                  type="button"
                  key={v}
                  className={`${styles.chip} ${
                    privacy === v ? styles.chipActive : ""
                  }`}
                  onClick={() => setPrivacy(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>GENRE</span>
            <div className={styles.chips}>
              {GENRES.map((v) => (
                <button
                  type="button"
                  key={v}
                  className={`${styles.chip} ${
                    genre === v ? styles.chipActive : ""
                  }`}
                  onClick={() => setGenre(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>
              DIFFICULTY <b>· sample complexity</b>
            </span>
            <div className={styles.chips}>
              {DIFFICULTY.map((v) => (
                <button
                  type="button"
                  key={v}
                  className={`${styles.chip} ${
                    diff === v ? styles.chipActive : ""
                  }`}
                  onClick={() => setDiff(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

        </form>
      </div>
    </Sketch>
  );
}
