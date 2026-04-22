"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";
import styles from "./NotificationsModal.module.css";

type Filter = "all" | "unread";

type NotifType = "FRIEND" | "INVITE" | "BADGE" | "SYSTEM";

type ApiNotification = {
  id: string;
  type: NotifType;
  message: string;
  read: boolean;
  actionPrimary: string | null;
  actionSecondary: string | null;
  actionPayload: Record<string, unknown> | null;
  createdAt: string;
};

export type NotificationsModalProps = {
  open: boolean;
  onClose: () => void;
};

const ICON: Record<NotifType, string> = {
  FRIEND: "+",
  INVITE: "♪",
  BADGE: "★",
  SYSTEM: "!",
};

/**
 * Convert `**word**` markers to safe <b> (no HTML injection).
 */
function renderMessage(msg: string): React.ReactNode {
  const parts = msg.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <b key={i}>{p.slice(2, -2)}</b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.max(diff, 1)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsModal({
  open,
  onClose,
}: NotificationsModalProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { notifications: ApiNotification[] };
        setItems(data.notifications);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const visible = items.filter((n) => filter === "all" || !n.read);

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", { method: "POST" });
  };

  const markOne = async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  };

  const onAction = async (
    n: ApiNotification,
    action: "primary" | "secondary",
  ) => {
    const payload = n.actionPayload ?? {};
    if (n.type === "FRIEND" && "friendshipId" in payload) {
      const fid = payload.friendshipId as string;
      const path = action === "primary" ? "accept" : "decline";
      await fetch(`/api/friends/${fid}/${path}`, { method: "POST" });
      await markOne(n.id);
    } else if (n.type === "INVITE" && "roomCode" in payload) {
      const code = payload.roomCode as string;
      await markOne(n.id);
      window.location.href = `/play/room/${code}`;
    } else {
      await markOne(n.id);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="NOTIFICATIONS" variant={2}>
      <div className={styles.head}>
        <div className={styles.filter}>
          <button
            className={`${styles.chip} ${filter === "all" ? styles.chipActive : ""}`}
            onClick={() => setFilter("all")}
          >
            ALL · {items.length}
          </button>
          <button
            className={`${styles.chip} ${filter === "unread" ? styles.chipActive : ""}`}
            onClick={() => setFilter("unread")}
          >
            UNREAD · {items.filter((n) => !n.read).length}
          </button>
        </div>
        <button className={styles.markBtn} onClick={markAll}>
          MARK ALL READ
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className={styles.empty}>LOADING…</div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>NO NOTIFICATIONS</div>
      ) : (
        <div className={styles.list}>
          {visible.map((n) => (
            <div
              key={n.id}
              className={`${styles.item} ${!n.read ? styles.unread : ""}`}
              onClick={() => markOne(n.id)}
            >
              <div
                className={`${styles.icon} ${
                  n.type === "FRIEND"
                    ? styles.iconFriend
                    : n.type === "INVITE"
                    ? styles.iconInvite
                    : n.type === "BADGE"
                    ? styles.iconBadge
                    : styles.iconSystem
                }`}
              >
                {ICON[n.type]}
              </div>
              <div className={styles.body}>
                <div className={styles.msg}>{renderMessage(n.message)}</div>
                <span className={styles.meta}>{relativeTime(n.createdAt)}</span>
              </div>
              {n.actionPrimary ? (
                <div className={styles.actions}>
                  <button
                    className={styles.act}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onAction(n, "primary");
                    }}
                  >
                    {n.actionPrimary}
                  </button>
                  {n.actionSecondary && (
                    <button
                      className={`${styles.act} ${styles.actGhost}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onAction(n, "secondary");
                      }}
                    >
                      {n.actionSecondary}
                    </button>
                  )}
                </div>
              ) : (
                <span className={styles.time}>{relativeTime(n.createdAt)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
