"use client";

import Modal from "@/components/Modal";
import styles from "./page.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export default function LeaveConfirmModal({
  open,
  onClose,
  onConfirm,
  busy = false,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Leave mid-battle?" variant={3}>
      <p className={styles.leaveBody}>
        You&apos;ll lose the battle by forfeit and earn 0 placement XP.
      </p>
      <div className={styles.leaveActions}>
        <button
          type="button"
          className={styles.leaveCancel}
          onClick={onClose}
          disabled={busy}
        >
          CANCEL
        </button>
        <button
          type="button"
          className={styles.leaveConfirm}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "…" : "LEAVE ANYWAY"}
        </button>
      </div>
    </Modal>
  );
}
