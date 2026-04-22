"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useUnsavedRegistration } from "@/components/UnsavedChanges";
import styles from "./page.module.css";

type Props = {
  username: string;
  initials: string;
  bio: string;
};

export default function ProfileForm({
  username,
  initials: initialI,
  bio: initialBio,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [initials, setInitials] = useState(initialI);
  const [bio, setBio] = useState(initialBio);

  const dirty =
    initials.trim().toUpperCase() !== initialI.trim().toUpperCase() ||
    bio.trim() !== initialBio.trim();

  const save = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initials: initials.trim().toUpperCase(),
          bio: bio.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "couldn't save profile");
        throw new Error(data.error ?? "save failed");
      }
      toast.success("Profile saved");
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "save failed") throw err;
      toast.error("connection error");
      throw err;
    }
  }, [initials, bio, toast, router]);

  const reset = useCallback(() => {
    setInitials(initialI);
    setBio(initialBio);
  }, [initialI, initialBio]);

  useUnsavedRegistration({
    id: "settings.profile",
    dirty,
    save,
    reset,
  });

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <span className={styles.label}>USERNAME</span>
        <input
          className={styles.input}
          value={username}
          readOnly
          disabled
        />
        <span className={styles.hint}>Username is permanent.</span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>INITIALS</span>
        <input
          className={styles.input}
          value={initials}
          onChange={(e) => setInitials(e.target.value.slice(0, 3))}
          maxLength={3}
          pattern="[A-Za-z0-9]+"
        />
        <span className={styles.hint}>
          1–3 letters or digits, shown on your avatar.
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>BIO</span>
        <textarea
          className={styles.textarea}
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 200))}
          maxLength={200}
          rows={3}
          placeholder="Beatmaker, trap head, night shift…"
        />
        <span className={styles.hint}>{bio.length}/200</span>
      </div>
    </div>
  );
}
