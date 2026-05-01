"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import styles from "./roomChat.module.css";

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; username: string; initials: string };
};

type Phase =
  | "LOBBY"
  | "REVEAL"
  | "PRODUCTION"
  | "UPLOAD"
  | "VOTING"
  | "RESULTS"
  | "CANCELLED";

type Props = {
  code: string;
  /** Current viewer — used to style own messages. */
  meId: string;
  /** Disable input when user is not a member or room is cancelled. */
  disabled?: boolean;
  /** Battle phase — drives default-open behavior + toast routing. */
  phase: Phase;
};

const POLL_MS = 4_000;
const MAX_LEN = 2000;

const SYSTEM_USERNAME = "system";

function isSystemMsg(m: ChatMessage): boolean {
  return m.user.username === SYSTEM_USERNAME;
}

function shouldDefaultOpen(phase: Phase): boolean {
  return phase === "VOTING" || phase === "RESULTS";
}

export default function RoomChat({
  code,
  meId,
  disabled = false,
  phase,
}: Props) {
  const toast = useToast();
  const [open, setOpen] = useState<boolean>(() => shouldDefaultOpen(phase));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sinceRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const wasAtBottomRef = useRef(true);
  const prevPhaseRef = useRef<Phase>(phase);
  const openRef = useRef(open);
  const phaseRef = useRef<Phase>(phase);

  // Keep refs in sync so the load callback (memoized for stability) can read
  // current open + phase without invalidating its identity each tick.
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Auto-open when entering VOTING or RESULTS.
  useEffect(() => {
    if (
      prevPhaseRef.current !== phase &&
      shouldDefaultOpen(phase) &&
      !open
    ) {
      setOpen(true);
    }
    prevPhaseRef.current = phase;
  }, [phase, open]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const load = useCallback(async () => {
    const qs = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "";
    try {
      const res = await fetch(`/api/rooms/${code}/chat${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      if (!mountedRef.current || data.messages.length === 0) return;

      const isInitial = !sinceRef.current;
      setMessages((curr) => {
        if (isInitial) {
          // Initial fetch — replace.
          return data.messages;
        }
        // Incremental — dedup by id.
        const existingIds = new Set(curr.map((m) => m.id));
        const fresh = data.messages.filter((m) => !existingIds.has(m.id));
        if (fresh.length === 0) return curr;
        return [...curr, ...fresh];
      });

      const last = data.messages[data.messages.length - 1];
      sinceRef.current = last.createdAt;

      if (isInitial) {
        // Don't ping or count on the first replay of history.
        return;
      }

      const fromOthers = data.messages.filter((m) => m.user.id !== meId);
      if (fromOthers.length === 0) return;

      const isOpen = openRef.current;
      const currentPhase = phaseRef.current;
      // Toast a new message when the chat is closed *and* the user is in the
      // middle of producing — otherwise the message gets lost behind the DAW
      // upload UI. Voting/Results we trust the auto-open + unread badge.
      if (
        !isOpen &&
        (currentPhase === "PRODUCTION" || currentPhase === "UPLOAD")
      ) {
        const m = fromOthers[fromOthers.length - 1];
        const trimmed = m.body.length > 60 ? `${m.body.slice(0, 57)}…` : m.body;
        const author = isSystemMsg(m) ? "system" : `@${m.user.username}`;
        toast.info(`${author}: ${trimmed}`, "Room chat");
      }

      if (!isOpen || !wasAtBottomRef.current) {
        setUnread((u) => u + fromOthers.length);
      }
    } catch {
      // Silent — polling will retry.
    }
  }, [code, meId, toast]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    // Auto-scroll only when the user was already near the bottom, so we don't
    // yank them away from scroll-back context.
    if (wasAtBottomRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollToBottom();
    }
  }, [open, scrollToBottom]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    wasAtBottomRef.current = distanceFromBottom < 40;
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || disabled) return;
    if (body.length > MAX_LEN) {
      toast.error(`Message too long (${body.length}/${MAX_LEN})`);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: ChatMessage;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "send failed");
        return;
      }
      if (data.message) {
        setMessages((curr) =>
          curr.some((m) => m.id === data.message!.id) ? curr : [...curr, data.message!],
        );
        sinceRef.current = data.message.createdAt;
        wasAtBottomRef.current = true;
      }
      setDraft("");
    } catch {
      toast.error("network error");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className={`${styles.wrap} ${open ? styles.wrapOpen : styles.wrapClosed}`}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.title}>ROOM CHAT</span>
        <span className={styles.headerMeta}>
          {unread > 0 && !open ? <b className={styles.unread}>{unread}</b> : null}
          <span className={styles.caret}>{open ? "▾" : "▴"}</span>
        </span>
      </button>

      {open && (
        <>
          <div
            ref={listRef}
            className={styles.list}
            onScroll={onListScroll}
            role="log"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className={styles.empty}>
                No messages yet — break the ice.
              </div>
            ) : (
              messages.map((m) => {
                if (isSystemMsg(m)) {
                  return (
                    <div key={m.id} className={styles.systemMsg}>
                      <span className={styles.systemBody}>{m.body}</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={m.id}
                    className={`${styles.msg} ${
                      m.user.id === meId ? styles.msgMine : ""
                    }`}
                  >
                    <span className={styles.author}>
                      <b>{m.user.initials}</b> @{m.user.username}
                    </span>
                    <span className={styles.body}>{m.body}</span>
                  </div>
                );
              })
            )}
          </div>

          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              className={styles.input}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={onKeyDown}
              placeholder={disabled ? "Chat closed" : "Say something…"}
              rows={1}
              disabled={disabled || sending}
              maxLength={MAX_LEN}
            />
            <button
              type="submit"
              className={styles.send}
              disabled={disabled || sending || draft.trim().length === 0}
            >
              {sending ? "…" : "SEND"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
