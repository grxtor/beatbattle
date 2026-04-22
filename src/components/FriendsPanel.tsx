"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sketch from "./Sketch";
import AddFriendModal from "./AddFriendModal";
import EmptyState from "./EmptyState";
import { useToast } from "./Toast";
import styles from "./FriendsPanel.module.css";

export type Friend = {
  name: string;
  initials: string;
  level: number;
  status: "online" | "inroom" | "offline";
  statusText: string;
  roomCode?: string | null;
};

export type FriendsPanelProps = {
  online: Friend[];
  offline: Friend[];
  className?: string;
  onAddFriend?: () => void;
  /** Code of the room the viewer is currently in — unlocks per-friend INVITE buttons. */
  inviteRoomCode?: string | null;
};

export default function FriendsPanel({
  online,
  offline,
  className = "",
  onAddFriend,
  inviteRoomCode = null,
}: FriendsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [invitingFriend, setInvitingFriend] = useState<string | null>(null);
  const [invitedFriends, setInvitedFriends] = useState<Set<string>>(new Set());

  const openAdd = () => {
    if (onAddFriend) onAddFriend();
    else setAddOpen(true);
  };

  const onFriendClick = (f: Friend) => {
    if (f.status === "inroom" && f.roomCode) {
      router.push(`/play/room/${f.roomCode}`);
    }
  };

  const invite = async (f: Friend) => {
    if (!inviteRoomCode) return;
    setInvitingFriend(f.name);
    try {
      const res = await fetch(`/api/rooms/${inviteRoomCode}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: f.name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "invite failed");
        return;
      }
      toast.success(`Invite sent to @${f.name}`);
      setInvitedFriends((s) => new Set(s).add(f.name));
    } catch {
      toast.error("network error");
    } finally {
      setInvitingFriend(null);
    }
  };

  return (
    <>
    <Sketch
      as="aside"
      variant={1}
      className={`${styles.panel} ${className}`}
    >
      <div className={styles.head}>
        <span className={styles.title}>FRIENDS</span>
        <span className={styles.meta}>{online.length} ONLINE</span>
      </div>

      <div className={styles.body}>
        {online.length + offline.length === 0 && (
          <EmptyState
            compact
            icon="@"
            label="NO FRIENDS YET"
            hint="Add your first producer and battle together."
            cta={{ label: "+ ADD FRIEND", onClick: openAdd }}
          />
        )}

        {online.length > 0 && (
          <>
            <Group label="ONLINE" count={online.length} />
            <div className={styles.list}>
              {online.map((f) => (
                <FriendRow
                  key={f.name}
                  f={f}
                  onClick={onFriendClick}
                  canInvite={
                    !!inviteRoomCode &&
                    f.status === "online" &&
                    f.roomCode !== inviteRoomCode
                  }
                  invited={invitedFriends.has(f.name)}
                  inviting={invitingFriend === f.name}
                  onInvite={() => invite(f)}
                />
              ))}
            </div>
          </>
        )}

        {offline.length > 0 && (
          <>
            <Group label="OFFLINE" count={offline.length} />
            <div className={styles.list}>
              {offline.map((f) => (
                <FriendRow key={f.name} f={f} onClick={onFriendClick} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.foot}>
        <Sketch
          as="button"
          variant={3}
          className={styles.addBtn}
          onClick={openAdd}
        >
          + ADD FRIEND
        </Sketch>
      </div>
    </Sketch>
    <AddFriendModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function Group({ label, count }: { label: string; count: number }) {
  return (
    <div className={styles.groupLbl}>
      <span>{label}</span>
      <b>{count}</b>
    </div>
  );
}

function FriendRow({
  f,
  onClick,
  canInvite = false,
  invited = false,
  inviting = false,
  onInvite,
}: {
  f: Friend;
  onClick?: (f: Friend) => void;
  canInvite?: boolean;
  invited?: boolean;
  inviting?: boolean;
  onInvite?: () => void;
}) {
  const dotCls =
    f.status === "inroom"
      ? styles.dotInRoom
      : f.status === "online"
      ? styles.dotOn
      : styles.dotOff;
  const clickable = f.status === "inroom" && !!f.roomCode;
  return (
    <div
      className={styles.friend}
      onClick={() => clickable && onClick?.(f)}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) onClick?.(f);
      }}
      style={{ cursor: clickable ? "pointer" : "default" }}
      title={clickable ? `Join ${f.roomCode}` : undefined}
    >
      <div className={styles.avatar}>
        {f.initials}
        <span className={`${styles.dot} ${dotCls}`} />
      </div>
      <div className={styles.meta2}>
        <span className={styles.name}>@{f.name}</span>
        <span
          className={`${styles.status} ${
            f.status === "inroom" ? styles.statusOrange : ""
          }`}
        >
          {f.statusText}
        </span>
      </div>
      {canInvite && onInvite ? (
        <button
          type="button"
          className={styles.inviteBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (!invited && !inviting) onInvite();
          }}
          disabled={invited || inviting}
          title={invited ? "Invited" : "Invite to this room"}
        >
          {invited ? "SENT" : inviting ? "…" : "INVITE"}
        </button>
      ) : (
        <span className={styles.lvl}>LVL {f.level}</span>
      )}
    </div>
  );
}
