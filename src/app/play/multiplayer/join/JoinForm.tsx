"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sketch from "@/components/Sketch";
import styles from "./page.module.css";

const LEN = 6;

export default function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(Array(LEN).fill(""));
  const [err, setErr] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const setChar = (i: number, raw: string) => {
    const ch = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1);
    const next = [...code];
    next[i] = ch;
    setCode(next);
    setErr("");
    if (ch && i < LEN - 1) inputs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < LEN - 1) {
      inputs.current[i + 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, LEN)
      .padEnd(LEN, "");
    const next = pasted.split("").slice(0, LEN);
    while (next.length < LEN) next.push("");
    setCode(next);
    const first = next.findIndex((c) => !c);
    inputs.current[first === -1 ? LEN - 1 : first]?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const joined = code.join("");
    if (joined.length < LEN) {
      setErr("ENTER ALL 6 CHARACTERS");
      return;
    }
    router.push(`/play/room/${joined}`);
  };

  const complete = code.every((c) => c !== "");

  return (
    <Sketch variant={1} className={styles.wrap}>
      <div className={styles.scroll}>
        <Link href="/play/multiplayer" className={styles.backLink}>
          ← BACK
        </Link>

        <form className={styles.center} onSubmit={submit}>
          <span className={styles.kicker}>JOIN A ROOM</span>
          <h1 className={styles.title}>
            ENTER THE <span>CODE</span>
          </h1>
          <p className={styles.sub}>
            6 characters — letters and numbers. Case-insensitive.
          </p>

          <div className={styles.codeRow}>
            {code.map((c, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                className={`${styles.slot} ${c ? styles.slotFilled : ""} ${
                  err ? styles.slotErr : ""
                }`}
                value={c}
                maxLength={1}
                inputMode="text"
                autoCapitalize="characters"
                onChange={(e) => setChar(i, e.target.value)}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={onPaste}
                aria-label={`Character ${i + 1}`}
              />
            ))}
          </div>

          <div className={styles.err}>{err || " "}</div>

          <button type="submit" className={styles.submit} disabled={!complete}>
            JOIN BATTLE →
          </button>

          <div className={styles.divider}>
            <span>OR</span>
          </div>

          <button type="button" className={styles.qrBtn}>
            ⟥ SCAN QR CODE
          </button>
        </form>
      </div>
    </Sketch>
  );
}
