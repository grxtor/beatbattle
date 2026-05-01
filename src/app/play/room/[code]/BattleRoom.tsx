"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sketch from "@/components/Sketch";
import { useToast } from "@/components/Toast";
import { QRCodeCanvas } from "qrcode.react";
import LayoutSplitter from "./LayoutSplitter";
import LeaveConfirmModal from "./LeaveConfirmModal";
import RoomSidePanel, { type PanelPlayer } from "./RoomSidePanel";
import RoomChat from "./RoomChat";
import WanderingMascot from "./WanderingMascot";
import TrackPlayer from "./TrackPlayer";
import VoteBreakdown from "./VoteBreakdown";
import WaitingOnList from "./WaitingOnList";
import styles from "./page.module.css";

type Phase = "LOBBY" | "REVEAL" | "PRODUCTION" | "UPLOAD" | "VOTING" | "RESULTS" | "CANCELLED";
type VoteRating = "INSANE" | "VERY_GOOD" | "GOOD" | "OKAY" | "BAD" | "VERY_BAD";

type RoomPlayer = {
  id: string;
  userId: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  lastSeenSecondsAgo: number;
  hasSubmitted: boolean;
  votesCast: number;
  votesTotal: number;
  user: { id: string; username: string; initials: string; level: number };
};

type Track = {
  id: string;
  /** null for other players' tracks during VOTING — server redacts for blind voting. */
  userId: string | null;
  createdAt: string;
  audioUrl: string | null;
  anonymousLabel: string;
  mine: boolean;
  myVote: { rating: VoteRating; locked: boolean } | null;
  voteBreakdown?: { rating: VoteRating; count: number }[];
};

type BattleResult = {
  place: number;
  trackScore: number;
  xpAwarded: number;
  coinsAwarded: number;
  voterXp: number;
  user: { id: string; username: string; initials: string; level: number };
};

type RoomResponse = {
  room: {
    id: string;
    code: string;
    name: string;
    genre: string;
    lengthMin: number;
    maxPlayers: number;
    difficulty: string;
    privacy: string;
    phase: Phase;
    phaseEndsAt: string | null;
    extendedSec: number;
    samples: { name: string; duration: string; audioUrl: string | null }[] | null;
    host: { id: string; username: string; initials: string; level: number };
    players: RoomPlayer[];
    tracks: Track[];
    results: BattleResult[];
  };
  me: {
    id: string;
    username: string;
    inRoom: boolean;
    submitted: boolean;
    canProduce: boolean;
    isSpectator: boolean;
    voteProgress: { cast: number; total: number };
  };
  serverTime: string;
};

const VOTE_OPTIONS: { label: VoteRating; display: string; xp: number }[] = [
  { label: "INSANE",    display: "INSANE",    xp: 5 },
  { label: "VERY_GOOD", display: "VERY GOOD", xp: 4 },
  { label: "GOOD",      display: "GOOD",      xp: 3 },
  { label: "OKAY",      display: "OKAY",      xp: 2 },
  { label: "BAD",       display: "BAD",       xp: 1 },
  { label: "VERY_BAD",  display: "VERY BAD",  xp: 0 },
];

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const ACCEPTED_MIMES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg"];

const URGENT_THRESHOLD_SEC = 10;
const TIMED_PHASES = new Set<Phase>(["REVEAL", "PRODUCTION", "UPLOAD", "VOTING"]);

// Resizable layout — clamp ranges + persistence key.
const LAYOUT_KEY = "beatbattle.layout.v1";
const LEFT_DEFAULT = 240;
const RIGHT_DEFAULT = 320;
const LEFT_MIN = 180;
const LEFT_MAX = 420;
const RIGHT_MIN = 240;
const RIGHT_MAX = 520;

type LayoutWidths = { left: number; right: number };

function readStoredLayout(): LayoutWidths {
  if (typeof window === "undefined") {
    return { left: LEFT_DEFAULT, right: RIGHT_DEFAULT };
  }
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { left: LEFT_DEFAULT, right: RIGHT_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<LayoutWidths>;
    const left = Math.max(
      LEFT_MIN,
      Math.min(LEFT_MAX, Number(parsed.left) || LEFT_DEFAULT),
    );
    const right = Math.max(
      RIGHT_MIN,
      Math.min(RIGHT_MAX, Number(parsed.right) || RIGHT_DEFAULT),
    );
    return { left, right };
  } catch {
    return { left: LEFT_DEFAULT, right: RIGHT_DEFAULT };
  }
}

type BattleRoomProps = { code: string };

function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function genreDisplay(g: string) {
  if (g === "LOFI") return "LO-FI";
  if (g === "HIPHOP") return "HIP-HOP";
  return g;
}

function transitionToast(prev: Phase, next: Phase, lengthMin: number): { tier: "info" | "error"; message: string } | null {
  if (next === "CANCELLED") return { tier: "error", message: "Room cancelled." };
  if (prev === "LOBBY" && next === "REVEAL") {
    return {
      tier: "info",
      message: `Samples revealed — ${lengthMin}:00 to produce!`,
    };
  }
  if (prev === "REVEAL" && next === "PRODUCTION") {
    return { tier: "info", message: "Production started — flip those samples!" };
  }
  if (prev === "PRODUCTION" && next === "UPLOAD") {
    return { tier: "info", message: "Time's up — upload your track now!" };
  }
  if (prev === "UPLOAD" && next === "VOTING") {
    return { tier: "info", message: "Voting time — rate the tracks blind." };
  }
  if (prev === "VOTING" && next === "RESULTS") {
    return { tier: "info", message: "Results in — let's see who won." };
  }
  return null;
}

export default function BattleRoom({ code: rawCode }: BattleRoomProps) {
  const router = useRouter();
  const toast = useToast();
  const code = rawCode.toUpperCase();

  const [data, setData] = useState<RoomResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [inviteCopied, setInviteCopied] = useState(false);
  const [playingSample, setPlayingSample] = useState<number | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voteTrackIdx, setVoteTrackIdx] = useState(0);
  const [localVotes, setLocalVotes] = useState<
    Record<string, { rating: VoteRating; locked: boolean }>
  >({});
  const [voteErr, setVoteErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [allowReplace, setAllowReplace] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [layout, setLayout] = useState<LayoutWidths>(() => ({
    left: LEFT_DEFAULT,
    right: RIGHT_DEFAULT,
  }));
  const pollingRef = useRef<number | null>(null);
  // Refs for one-shot effects driven by polling deltas.
  const lastPhaseRef = useRef<Phase | null>(null);
  const restoreFiredRef = useRef(false);

  // Hydrate layout widths from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setLayout(readStoredLayout());
  }, []);

  const persistLayout = useCallback((next: LayoutWidths) => {
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {
      /* storage full / disabled — fine, just lose persistence */
    }
  }, []);

  /* --- polling + time tick --- */

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (!res.ok) {
        setLoadErr((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        return;
      }
      setData((await res.json()) as RoomResponse);
      setLoadErr(null);
    } catch {
      setLoadErr("connection error");
    }
  }, [code]);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 2500);
    pollingRef.current = id;
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* --- auto-join if not in room (LOBBY only) --- */

  useEffect(() => {
    if (!data || data.me.inRoom || joining) return;
    if (data.room.phase !== "LOBBY") return; // battle already running — do not join
    setJoining(true);
    fetch(`/api/rooms/${code}/join`, { method: "POST" })
      .then(() => load())
      .finally(() => setJoining(false));
  }, [data, code, load, joining]);

  /* --- phase transition toasts + first-poll restore toasts --- */

  useEffect(() => {
    if (!data) return;
    const phase = data.room.phase;
    const prev = lastPhaseRef.current;

    if (prev === null) {
      // First poll — fire any restore-state toasts.
      if (!restoreFiredRef.current) {
        restoreFiredRef.current = true;
        if (phase === "VOTING") {
          if (
            data.me.voteProgress.total > 0 &&
            data.me.voteProgress.cast > 0
          ) {
            toast.info(
              `Welcome back — you've voted ${data.me.voteProgress.cast}/${data.me.voteProgress.total} tracks.`,
            );
          }
          // Skip already-voted tracks so the user lands on the next one.
          const tracks = data.room.tracks.filter((t) => !t.mine);
          const firstUnvoted = tracks.findIndex((t) => !t.myVote?.locked);
          if (firstUnvoted > 0) setVoteTrackIdx(firstUnvoted);
        } else if ((phase === "UPLOAD" || phase === "PRODUCTION") && data.me.submitted) {
          toast.info("Track already uploaded — you can preview or replace below.");
        }
      }
    } else if (prev !== phase) {
      const t = transitionToast(prev, phase, data.room.lengthMin);
      if (t) {
        if (t.tier === "error") toast.error(t.message);
        else toast.info(t.message);
      }
    }
    lastPhaseRef.current = phase;
  }, [data, toast]);

  /* --- derived --- */

  const countdown = useMemo(() => {
    if (!data?.room.phaseEndsAt) return null;
    const diff = new Date(data.room.phaseEndsAt).getTime() - now;
    return Math.max(0, Math.floor(diff / 1000));
  }, [data, now]);

  const me = data?.me;
  const room = data?.room;
  const isHost = room?.host.id === me?.id;
  const amReady = room?.players.find((p) => p.userId === me?.id)?.isReady ?? false;

  const isUrgent =
    countdown !== null &&
    countdown <= URGENT_THRESHOLD_SEC &&
    room !== undefined &&
    TIMED_PHASES.has(room.phase);

  /* --- sample audio playback --- */

  useEffect(() => {
    const el = sampleAudioRef.current;
    if (!el) return;
    if (playingSample === null) {
      el.pause();
      return;
    }
    const s = room?.samples?.[playingSample];
    if (!s?.audioUrl) {
      setPlayingSample(null);
      return;
    }
    el.src = s.audioUrl;
    el.currentTime = 0;
    void el.play().catch(() => setPlayingSample(null));
  }, [playingSample, room?.samples]);

  /* --- actions --- */

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/play/room/${code}`
      : `/play/room/${code}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      toast.success(`Invite link copied`);
      setTimeout(() => setInviteCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const toggleReady = async () => {
    await fetch(`/api/rooms/${code}/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ready: !amReady }),
    });
    await load();
  };

  const start = async () => {
    await fetch(`/api/rooms/${code}/start`, { method: "POST" });
    await load();
  };

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickFile = () => {
    if (uploadBusy) return;
    // Allow re-upload when the user has explicitly opted in via "Replace track".
    if (me?.submitted && !allowReplace) return;
    fileInputRef.current?.click();
  };

  const uploadTrack = useCallback(
    async (file: File) => {
      if (file.size === 0) {
        toast.error("Empty file");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`File too large (max 30 MB)`);
        return;
      }
      const isAccepted =
        ACCEPTED_MIMES.includes(file.type) ||
        /\.(mp3|wav|ogg)$/i.test(file.name);
      if (!isAccepted) {
        toast.error("Use mp3, wav, or ogg");
        return;
      }
      setUploadBusy(true);
      setUploadPct(0);
      try {
        const form = new FormData();
        form.append("file", file);

        // XHR so we can surface upload progress; fetch streams aren't widely
        // supported yet.
        const result = await new Promise<{ replaced: boolean }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/rooms/${code}/track`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadPct(Math.round((e.loaded / e.total) * 100));
            }
          };
          xhr.onload = () => {
            let body: { error?: string; replaced?: boolean } = {};
            try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ replaced: Boolean(body.replaced) });
            } else {
              reject(new Error(body.error ?? `HTTP ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("network error"));
          xhr.send(form);
        });
        setUploadPct(100);
        toast.success(result.replaced ? "Track replaced" : "Track uploaded");
        // Always lock the replace gate again after a successful upload.
        setAllowReplace(false);
        setShowPreview(false);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "upload failed");
      } finally {
        setUploadBusy(false);
        setUploadPct(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [code, load, toast],
  );

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void uploadTrack(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (uploadBusy) return;
    if (me?.submitted && !allowReplace) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void uploadTrack(f);
  };

  const castVote = async (
    trackId: string,
    rating: VoteRating,
    lock: boolean,
  ) => {
    setLocalVotes((v) => ({ ...v, [trackId]: { rating, locked: lock } }));
    setVoteErr(null);
    try {
      const res = await fetch(`/api/rooms/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, rating, lock }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setVoteErr(j.error ?? `HTTP ${res.status}`);
        // Refresh from server so local state matches reality.
        void load();
        return;
      }
      const j = (await res.json()) as { ok: true; rating: VoteRating; locked: boolean };
      setLocalVotes((v) => ({ ...v, [trackId]: { rating: j.rating, locked: j.locked } }));
      // When the vote locks, automatically advance to the next un-voted track
      // so producers don't have to click NEXT TRACK each round.
      if (j.locked) {
        // Read latest tracks/votes via the most recent data snapshot.
        const tracks = data?.room.tracks.filter((t) => !t.mine) ?? [];
        // Find next un-voted track AFTER the current index.
        let nextIdx = -1;
        for (let i = 0; i < tracks.length; i++) {
          if (i === voteTrackIdx) continue;
          const tt = tracks[i];
          const lv = (tt.id === trackId
            ? { rating: j.rating, locked: j.locked }
            : localVotes[tt.id] ?? tt.myVote) ?? null;
          if (!lv?.locked && i > voteTrackIdx) {
            nextIdx = i;
            break;
          }
        }
        if (nextIdx === -1) {
          for (let i = 0; i < tracks.length; i++) {
            const tt = tracks[i];
            if (tt.id === trackId) continue;
            const lv = localVotes[tt.id] ?? tt.myVote;
            if (!lv?.locked) {
              nextIdx = i;
              break;
            }
          }
        }
        if (nextIdx !== -1) setVoteTrackIdx(nextIdx);
      }
    } catch {
      setVoteErr("connection error");
    }
  };

  const performLeave = useCallback(async () => {
    setLeaving(true);
    try {
      await fetch(`/api/rooms/${code}/leave`, { method: "POST" });
      router.push("/");
    } finally {
      setLeaving(false);
    }
  }, [code, router]);

  const onLeaveClick = () => {
    if (!room) {
      void performLeave();
      return;
    }
    const phase = room.phase;
    const isActiveBattle =
      phase === "REVEAL" ||
      phase === "PRODUCTION" ||
      phase === "UPLOAD" ||
      phase === "VOTING";
    if (isActiveBattle) {
      setLeaveOpen(true);
    } else {
      void performLeave();
    }
  };

  /* --- render --- */

  if (loadErr) {
    return (
      <div className={styles.wrap}>
        <div className={styles.roomHead}>
          <div className={styles.roomTitle}>
            <span className={styles.roomCode}>{code}</span>
          </div>
          <Link href="/" className={styles.leaveLink}>← LEAVE</Link>
        </div>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <p>{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!data || !room || !me) {
    return (
      <div className={styles.wrap}>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>LOADING…</div>
      </div>
    );
  }

  const phase = room.phase;
  const samples = room.samples ?? [];
  const votingTracks = room.tracks.filter((t) => !t.mine);
  const currentVoteTrack = votingTracks[voteTrackIdx];
  // Server vote (authoritative for lock) preferred; fall back to optimistic local state.
  const currentVoteState = currentVoteTrack
    ? localVotes[currentVoteTrack.id] ?? currentVoteTrack.myVote ?? null
    : null;
  const currentVoteSelection = currentVoteState?.rating;
  const currentVoteLocked = currentVoteState?.locked ?? false;

  // VOTING global progress — count producers who have completed their vote
  // duties. Spectators (votesTotal === 0) are excluded from the denominator.
  const votingPlayers = room.players.filter((p) => p.votesTotal > 0);
  const votedComplete = votingPlayers.filter((p) => p.votesCast >= p.votesTotal).length;

  // Helper: full panel player view used in every phase.
  const panelPlayers: PanelPlayer[] = room.players;
  const readyCount = room.players.filter((p) => p.isReady).length;
  const filledSlots = room.players.length;
  const emptySlots = Math.max(0, room.maxPlayers - filledSlots);
  const lobbySlots = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] ?? null);
  const lobbyStatus = isHost
    ? filledSlots < 2
      ? "Solo start available"
      : `${filledSlots} producers in room`
    : amReady
    ? "Ready - waiting for host"
    : "Mark ready when you are set";

  // Locate user's own track for preview UI in PRODUCTION/UPLOAD.
  const myTrack = room.tracks.find((t) => t.mine && t.audioUrl);
  const allDoneVoting =
    me.voteProgress.total > 0 && me.voteProgress.cast >= me.voteProgress.total;

  return (
    <div className={styles.wrap}>
      {/* ---- room header ---- */}
      <div className={styles.roomHead}>
        <div className={styles.roomTitle}>
          <span className={styles.roomCode}>{code}</span>
          <span className={styles.roomName}>{room.name}</span>
        </div>
        <div className={styles.roomMeta}>
          <span className={`${styles.metaTag} ${styles.orange}`}>{genreDisplay(room.genre)}</span>
          <span className={styles.metaTag}>{room.lengthMin}M</span>
          <span className={styles.metaTag}>{room.difficulty}</span>
          <span className={styles.metaTag}>
            {room.players.length}/{room.maxPlayers}
          </span>
        </div>
        <button onClick={onLeaveClick} className={styles.leaveLink} style={{ border: "none", background: "none" }}>
          ← LEAVE
        </button>
      </div>

      <PhaseSteps phase={phase} />

      <div
        className={`${styles.gameGrid} ${phase === "LOBBY" ? styles.lobbyGameGrid : ""}`}
        style={
          phase === "LOBBY"
            ? undefined
            : {
                gridTemplateColumns: `${layout.left}px 8px minmax(0, 1fr) 8px ${layout.right}px`,
              }
        }
      >
        {/* Left rail — players + per-row kick + host tools. Always visible
            mid-battle so everyone can see who's online / submitted / voting. */}
        {phase !== "LOBBY" && (
          <>
            <RoomSidePanel
              code={code}
              phase={phase}
              players={panelPlayers}
              results={room.results}
              meId={me.id}
              isHost={isHost}
              extendedSec={room.extendedSec}
              onAfterAction={load}
            />

            <LayoutSplitter
              value={layout.left}
              min={LEFT_MIN}
              max={LEFT_MAX}
              edge="left"
              ariaLabel="Resize players panel"
              onChange={(w) => setLayout((l) => ({ ...l, left: w }))}
              onCommit={(w) => persistLayout({ ...layout, left: w })}
            />
          </>
        )}

        <div className={styles.gameMain}>
          {/* Spectator banner — surfaces above whichever phase content renders below. */}
          {me.isSpectator && phase !== "RESULTS" && phase !== "CANCELLED" && (
            <div className={styles.spectatorBanner}>
              <span>
                <b>Spectator mode</b> — you joined mid-battle. You can vote and earn voting XP, but cannot submit a track.
              </span>
            </div>
          )}

      {/* ===================== LOBBY ===================== */}
      {phase === "LOBBY" && (
        <div className={styles.lobbyV2}>
          <Sketch variant={1} className={styles.lobbyBoard}>
            <div className={styles.lobbyTopline}>
              <div>
                <span className={styles.lobbyEyebrow}>BATTLE LOBBY</span>
                <h2 className={styles.lobbyBoardTitle}>{room.name}</h2>
              </div>
              <div className={styles.lobbyRoomCode}>
                <span>ROOM</span>
                <b>{code}</b>
              </div>
            </div>

            <div className={styles.lobbyBoardGrid}>
              <section className={styles.lobbyLaunchPanel}>
                <div className={styles.launchMeter}>
                  <span className={styles.launchLabel}>START STATUS</span>
                  <strong>{lobbyStatus}</strong>
                  <span className={styles.launchSub}>
                    {readyCount}/{filledSlots} ready - {emptySlots} open slots
                  </span>
                </div>

                <div className={styles.lobbySlotGrid} aria-label="Lobby player slots">
                  {lobbySlots.map((player, i) => (
                    <div
                      key={player?.id ?? `empty-${i}`}
                      className={`${styles.lobbySlot} ${
                        player ? styles.lobbySlotFilled : styles.lobbySlotEmpty
                      } ${player?.isReady ? styles.lobbySlotReady : ""} ${
                        player?.isHost ? styles.lobbySlotHost : ""
                      }`}
                    >
                      <span className={styles.slotNumber}>{i + 1}</span>
                      {player ? (
                        <div className={styles.slotBody}>
                          <span className={styles.slotName}>@{player.user.username}</span>
                          <span className={styles.slotMeta}>
                            {player.isHost ? "HOST" : player.isReady ? "READY" : "WAITING"}
                          </span>
                        </div>
                      ) : (
                        <span className={styles.slotEmptyText}>OPEN</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className={styles.lobbyCtaWrap}>
                  {isHost ? (
                    <button
                      type="button"
                      className={`${styles.lobbyCtaPrimary} ${
                        room.players.length < 2 ? styles.lobbyCtaSolo : ""
                      }`}
                      onClick={start}
                    >
                      {room.players.length < 2 ? "START SOLO ->" : "START BATTLE ->"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.lobbyCtaPrimary} ${amReady ? styles.lobbyCtaReady : ""}`}
                      onClick={toggleReady}
                    >
                      {amReady ? "READY - WAITING FOR HOST" : "MARK READY"}
                    </button>
                  )}
                </div>
              </section>

              <aside className={styles.lobbyInfoPanel}>
                <div className={styles.lobbyRules}>
                  <span className={styles.panelLabel}>ROOM SETTINGS</span>
                  <dl>
                    <div><dt>GENRE</dt><dd>{genreDisplay(room.genre)}</dd></div>
                    <div><dt>LENGTH</dt><dd>{room.lengthMin} MINUTES</dd></div>
                    <div><dt>DIFFICULTY</dt><dd>{room.difficulty}</dd></div>
                    <div><dt>PRIVACY</dt><dd>{room.privacy}</dd></div>
                    <div><dt>HOST</dt><dd>@{room.host.username}</dd></div>
                  </dl>
                </div>

                <div className={styles.lobbyInviteBox}>
                  <div className={styles.inviteHead}>
                    <span className={styles.panelLabel}>INVITE</span>
                    <button
                      type="button"
                      className={`${styles.heroCopyBtn} ${inviteCopied ? styles.heroCopyOk : ""}`}
                      onClick={copyInvite}
                    >
                      {inviteCopied ? "COPIED" : "COPY"}
                    </button>
                  </div>
                  <span className={styles.heroLink}>{inviteUrl.replace(/^https?:\/\//, "")}</span>
                  <div className={styles.heroQR} aria-hidden="true">
                    <QRCodeCanvas
                      value={inviteUrl}
                      size={112}
                      bgColor="transparent"
                      fgColor="#ff8a2a"
                      marginSize={0}
                      level="M"
                    />
                  </div>
                </div>
              </aside>
            </div>

            <div className={styles.lobbyFlow}>
              <span>LOBBY</span>
              <span>REVEAL</span>
              <span>PRODUCE</span>
              <span>UPLOAD</span>
              <span>VOTE</span>
              <span>RESULT</span>
            </div>

            <span className={styles.lobbyTip}>
              Use all 4 samples in your beat for bonus XP.
            </span>
          </Sketch>
        </div>
      )}

      {/* ===================== REVEAL ===================== */}
      {phase === "REVEAL" && (
        <Sketch variant={1} className={styles.reveal}>
          <span className={styles.phaseKicker}>SAMPLES DROPPED</span>
          <h2 className={styles.phaseTitle}>GET <span>READY</span></h2>
          <div className={`${styles.bigTimer} ${isUrgent ? styles.urgent : ""}`}>
            {fmtCountdown(countdown ?? 0)}
          </div>

          <div className={styles.sampleGrid}>
            {samples.map((s, i) => (
              <Sketch variant={((i % 3) + 1) as 1 | 2 | 3} key={s.name} className={styles.sample}>
                <div className={styles.sampleHead}>
                  <span className={styles.sampleName}>{s.name}</span>
                  <span className={styles.sampleDur}>{s.duration}</span>
                </div>
                <div className={`${styles.waveform} ${playingSample === i ? styles.playing : ""}`} />
                <button
                  className={`${styles.playBtn} ${playingSample === i ? styles.active : ""}`}
                  onClick={() => setPlayingSample(playingSample === i ? null : i)}
                  disabled={!s.audioUrl}
                  title={s.audioUrl ? undefined : "No preview available"}
                >
                  {!s.audioUrl ? "— MUTED" : playingSample === i ? "■ STOP" : "▸ PLAY"}
                </button>
              </Sketch>
            ))}
          </div>

          {samples.some((s) => s.audioUrl) && (
            <a
              href={`/api/rooms/${code}/samples.zip`}
              download
              className={styles.downloadSamples}
            >
              ⬇ DOWNLOAD SAMPLES (.zip)
            </a>
          )}
        </Sketch>
      )}

      {/* ===================== PRODUCTION ===================== */}
      {phase === "PRODUCTION" && (
        <div className={styles.production}>
          <Sketch variant={1} className={styles.prodMain}>
            <span className={styles.prodLabel}>PRODUCE YOUR BEAT</span>
            <div className={`${styles.prodTimer} ${isUrgent ? styles.urgent : (countdown ?? 0) < 11 ? styles.warn : ""}`}>
              {fmtCountdown(countdown ?? 0)}
            </div>
            <p className={styles.prodTip}>
              Use all 4 samples for bonus XP. Your DAW is ready — flip it before the clock hits zero.
            </p>

            {!me.canProduce ? (
              <div className={styles.donePanel}>
                Spectating
                <small>You joined mid-battle — chat and vote are still open.</small>
              </div>
            ) : me.submitted ? (
              <>
                <div className={styles.submittedRow}>
                  <button
                    type="button"
                    className={styles.submittedBtn}
                    onClick={() => setShowPreview((v) => !v)}
                    disabled={!myTrack?.audioUrl}
                  >
                    {showPreview ? "■ HIDE PREVIEW" : "▸ PREVIEW"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.submittedBtn} ${styles.replace}`}
                    onClick={() => {
                      setAllowReplace(true);
                      // Defer the click into the next tick so React flushes
                      // the disabled-state change before the picker opens.
                      window.setTimeout(() => fileInputRef.current?.click(), 0);
                    }}
                    disabled={uploadBusy}
                  >
                    {uploadBusy ? `UPLOADING… ${uploadPct}%` : "↻ REPLACE TRACK"}
                  </button>
                </div>
                {showPreview && myTrack?.audioUrl && (
                  <div className={styles.previewWrap}>
                    <TrackPlayer
                      src={myTrack.audioUrl}
                      label="YOUR TRACK"
                      resetKey={myTrack.id}
                    />
                  </div>
                )}
              </>
            ) : (
              <button
                className={styles.uploadCta}
                disabled={uploadBusy}
                onClick={pickFile}
              >
                {uploadBusy ? `UPLOADING… ${uploadPct}%` : "UPLOAD TRACK →"}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
              onChange={onFileSelected}
              hidden
            />
          </Sketch>

          <Sketch variant={2} className={`${styles.prodSide} ${styles.prodSideSticky}`}>
            <div className={styles.prodSideTitle}>SAMPLES · REPLAY</div>
            {samples.some((s) => s.audioUrl) && (
              <a
                href={`/api/rooms/${code}/samples.zip`}
                download
                className={styles.downloadSamples}
              >
                ⬇ DOWNLOAD .ZIP
              </a>
            )}
            {samples.map((s, i) => (
              <div key={s.name} className={styles.miniSample}>
                <div className={styles.miniSampleBody}>
                  <span className={styles.miniSampleName}>{s.name}</span>
                  <span className={styles.miniSampleDur}>{s.duration}</span>
                </div>
                <button
                  className={styles.miniPlay}
                  onClick={() => setPlayingSample(playingSample === i ? null : i)}
                  disabled={!s.audioUrl}
                  title={s.audioUrl ? undefined : "No preview available"}
                >
                  {!s.audioUrl ? "–" : playingSample === i ? "■" : "▸"}
                </button>
              </div>
            ))}
          </Sketch>
        </div>
      )}

      {/* ===================== UPLOAD ===================== */}
      {phase === "UPLOAD" && (
        <Sketch variant={1} className={styles.upload}>
          <span className={styles.phaseKicker}>UPLOAD WINDOW</span>
          <h2 className={styles.phaseTitle}>DROP YOUR <span>TRACK</span></h2>
          <div className={`${styles.bigTimer} ${isUrgent ? styles.urgent : ""}`}>
            {fmtCountdown(countdown ?? 0)}
          </div>

          {!me.canProduce ? (
            <div className={styles.donePanel}>
              Spectating
              <small>You joined mid-battle — submissions are closed for you.</small>
            </div>
          ) : me.submitted ? (
            <>
              <div className={styles.submittedRow}>
                <button
                  type="button"
                  className={styles.submittedBtn}
                  onClick={() => setShowPreview((v) => !v)}
                  disabled={!myTrack?.audioUrl}
                >
                  {showPreview ? "■ HIDE PREVIEW" : "▸ PREVIEW"}
                </button>
                <button
                  type="button"
                  className={`${styles.submittedBtn} ${styles.replace}`}
                  onClick={() => {
                    setAllowReplace(true);
                    window.setTimeout(() => fileInputRef.current?.click(), 0);
                  }}
                  disabled={uploadBusy}
                >
                  {uploadBusy ? `UPLOADING… ${uploadPct}%` : "↻ REPLACE TRACK"}
                </button>
              </div>
              {showPreview && myTrack?.audioUrl && (
                <div className={styles.previewWrap}>
                  <TrackPlayer
                    src={myTrack.audioUrl}
                    label="YOUR TRACK"
                    resetKey={myTrack.id}
                  />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
                onChange={onFileSelected}
                hidden
              />
            </>
          ) : (
            <>
              <Sketch
                variant={2}
                as="div"
                className={`${styles.dropzone}`}
                onClick={pickFile}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
              >
                <div className={styles.dropIcon}>
                  {uploadBusy ? "…" : "↑"}
                </div>
                <span className={styles.dropText}>
                  {uploadBusy ? `UPLOADING ${uploadPct}%` : "DROP OR CLICK TO UPLOAD"}
                </span>
                <span className={styles.dropHint}>
                  mp3 / wav / ogg · max 30 MB
                </span>
              </Sketch>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
                onChange={onFileSelected}
                hidden
              />
            </>
          )}

          <div className={styles.uploadStats}>
            <Sketch variant={1} className={styles.uStat}>
              <span className={styles.uStatLbl}>TIME LEFT</span>
              <span className={styles.uStatVal}>{fmtCountdown(countdown ?? 0)}</span>
            </Sketch>
            <Sketch variant={2} className={styles.uStat}>
              <span className={styles.uStatLbl}>SUBMITTED</span>
              <span className={`${styles.uStatVal} ${styles.ok}`}>
                {room.tracks.length}/{room.players.length}
              </span>
            </Sketch>
            <Sketch variant={3} className={styles.uStat}>
              <span className={styles.uStatLbl}>STATUS</span>
              <span className={`${styles.uStatVal} ${me.submitted ? styles.ok : ""}`}>
                {me.submitted ? "READY" : "WAITING"}
              </span>
            </Sketch>
          </div>

          <WaitingOnList
            players={room.players}
            countdownLabel={fmtCountdown(countdown ?? 0)}
          />
        </Sketch>
      )}

      {/* ===================== VOTING ===================== */}
      {phase === "VOTING" && currentVoteTrack && !allDoneVoting && (
        <div className={styles.voting}>
          <Sketch variant={1} className={styles.voteHeader}>
            <span className={styles.voteCount}>
              VOTE · <b>{currentVoteTrack.anonymousLabel}</b>
              {" "}({voteTrackIdx + 1}/{votingTracks.length})
            </span>
            <div className={styles.voteProg}>
              {votingTracks.map((t, i) => {
                const done = (localVotes[t.id] ?? t.myVote)?.locked;
                return (
                  <span
                    key={t.id}
                    className={i < voteTrackIdx || done ? styles.on : ""}
                  />
                );
              })}
            </div>
          </Sketch>

          <div className={styles.voteGlobal}>
            <span className={styles.voteGlobalLine}>
              <b>{votedComplete}</b>/<b>{votingPlayers.length}</b> producers have voted
            </span>
            {votingPlayers.length > 0 && (
              <div className={styles.voteGlobalGrid}>
                {votingPlayers.map((p) => {
                  const done = p.votesCast >= p.votesTotal;
                  return (
                    <span
                      key={p.id}
                      className={`${styles.voteGlobalCell} ${done ? styles.done : ""}`}
                    >
                      <span>@{p.user.username}</span>
                      <span>{p.votesCast}/{p.votesTotal}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <Sketch variant={2} className={styles.track}>
            <div className={styles.trackHead}>
              <span className={styles.trackTag}>TRACK {currentVoteTrack.anonymousLabel}</span>
              <span className={styles.trackAnon}>Anonymous · reveal after voting</span>
            </div>
            <TrackPlayer
              src={currentVoteTrack.audioUrl}
              label={currentVoteTrack.anonymousLabel}
              resetKey={currentVoteTrack.id}
            />

            <div className={styles.voteGrid}>
              {VOTE_OPTIONS.map((v) => {
                const picked = currentVoteSelection === v.label;
                return (
                  <button
                    key={v.label}
                    className={`${styles.voteBtn} ${picked ? styles.picked : ""}`}
                    disabled={currentVoteLocked}
                    title={
                      currentVoteLocked
                        ? "Vote locked"
                        : picked
                        ? "Tap again to lock"
                        : "Pick rating"
                    }
                    onClick={() =>
                      castVote(
                        currentVoteTrack.id,
                        v.label,
                        // Re-clicking the same rating locks it.
                        picked,
                      )
                    }
                  >
                    <span className={styles.voteLabel}>{v.display}</span>
                    <span className={styles.voteXp}>+{v.xp} XP</span>
                  </button>
                );
              })}
            </div>

            {voteErr && (
              <div style={{ color: "var(--danger, #c33)", fontSize: 12, textAlign: "center", marginTop: 8 }}>
                {voteErr}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className={styles.nextTrackBtn}
                style={{ flex: 1 }}
                disabled={!currentVoteSelection || currentVoteLocked}
                onClick={() =>
                  currentVoteSelection &&
                  castVote(currentVoteTrack.id, currentVoteSelection, true)
                }
              >
                {currentVoteLocked ? "✓ LOCKED" : "LOCK VOTE"}
              </button>
              <button
                className={styles.nextTrackBtn}
                style={{ flex: 1 }}
                disabled={!currentVoteLocked}
                onClick={() => {
                  if (voteTrackIdx < votingTracks.length - 1) {
                    setVoteTrackIdx((t) => t + 1);
                  }
                }}
              >
                {voteTrackIdx < votingTracks.length - 1 ? "NEXT TRACK →" : "DONE — WAIT"}
              </button>
            </div>
          </Sketch>

          <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--text-faint)" }}>
            Time left: <span className={isUrgent ? styles.urgent : ""}>{fmtCountdown(countdown ?? 0)}</span>
          </div>
        </div>
      )}

      {phase === "VOTING" && allDoneVoting && (
        <div className={styles.donePanel}>
          DONE — WAITING
          <small>Voting in progress — results land when the timer hits zero.</small>
        </div>
      )}

      {phase === "VOTING" && votingTracks.length === 0 && (
        <div style={{ padding: 40, textAlign: "center" }}>
          No tracks to vote on — waiting for results…
        </div>
      )}

      {/* ===================== RESULTS ===================== */}
      {phase === "RESULTS" && (
        <div className={styles.results}>
          <Sketch variant={1} className={styles.resultHead}>
            <span className={styles.phaseKicker}>BATTLE COMPLETE</span>
            <h2 className={styles.phaseTitle}>THE <span>RESULTS</span></h2>
          </Sketch>

          {room.results.length <= 1 && (
            <div className={styles.soloBanner}>
              <span>
                <b>Solo battle</b> — no opponents joined. Invite friends next time!
              </span>
            </div>
          )}

          {room.results.length >= 3 && (
            <div className={styles.podium}>
              {[1, 0, 2].map((idx) => {
                const r = room.results[idx];
                if (!r) return null;
                const cls = r.place === 1 ? styles.first : r.place === 2 ? styles.second : styles.third;
                return (
                  <Sketch
                    key={r.user.id}
                    variant={r.place === 1 ? 1 : r.place === 2 ? 2 : 3}
                    className={`${styles.podSlot} ${r.place === 1 ? styles.first : ""}`}
                  >
                    <span className={`${styles.podRank} ${cls}`}>#{r.place}</span>
                    <div className={styles.podAvatar}>{r.user.initials}</div>
                    <span className={styles.podName}>@{r.user.username}</span>
                    <span className={styles.podXp}>+{r.xpAwarded} XP</span>
                    <div className={styles.podVotes}>
                      <span>Score: {r.trackScore}</span>
                    </div>
                  </Sketch>
                );
              })}
            </div>
          )}

          <Sketch variant={1} className={styles.resultList}>
            {room.results.map((r) => {
              const placementXp = Math.max(0, r.xpAwarded - r.voterXp);
              const trackForUser = room.tracks.find((t) => t.userId === r.user.id);
              return (
                <div
                  key={r.user.id}
                  className={`${styles.resultRowExt} ${r.user.id === me.id ? styles.me : ""}`}
                >
                  <span className={styles.resultRank}>#{r.place}</span>
                  <div className={styles.resultAv}>{r.user.initials}</div>
                  <div className={styles.resultMain}>
                    <div className={styles.resultTopRow}>
                      <span className={`${styles.resultName} ${r.user.id === me.id ? styles.me : ""}`}>
                        @{r.user.username}{r.user.id === me.id && " (YOU)"}
                      </span>
                      <span className={styles.resultLvl}>LVL {r.user.level} · score {r.trackScore}</span>
                    </div>
                    {trackForUser?.voteBreakdown && (
                      <VoteBreakdown breakdown={trackForUser.voteBreakdown} />
                    )}
                  </div>
                  <div className={styles.resultXpCol}>
                    <span className={styles.resultXpLine}>
                      <b>+{placementXp}</b> XP placement
                    </span>
                    <span className={styles.resultXpLine}>
                      <b>+{r.voterXp}</b> XP voting
                    </span>
                    <span className={styles.resultXpTotal}>
                      +{r.xpAwarded} XP · +{r.coinsAwarded} ¢
                    </span>
                  </div>
                </div>
              );
            })}
          </Sketch>

          <div className={styles.resultsCta}>
            <Link href="/play" className={styles.rematch}>
              NEW BATTLE →
            </Link>
            <Link href="/" className={styles.goHome}>← BACK HOME</Link>
          </div>
        </div>
      )}

      {phase === "CANCELLED" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>ROOM CANCELLED</h2>
          <Link href="/">← BACK HOME</Link>
        </div>
      )}
        </div>

        {phase !== "LOBBY" && (
          <LayoutSplitter
            value={layout.right}
            min={RIGHT_MIN}
            max={RIGHT_MAX}
            edge="right"
            ariaLabel="Resize chat panel"
            onChange={(w) => setLayout((l) => ({ ...l, right: w }))}
            onCommit={(w) => persistLayout({ ...layout, right: w })}
          />
        )}

        {/* Right rail — chat. Mounted only while in-room and not cancelled. */}
        {me.inRoom && phase !== "CANCELLED" ? (
          <RoomChat code={code} meId={me.id} phase={phase} />
        ) : (
          <div aria-hidden />
        )}
      </div>

      <WanderingMascot
        bounds={{
          left: phase === "LOBBY" ? 22 : 22 + layout.left + 8 + 16,
          right: 22 + layout.right + 8 + 16,
        }}
      />

      <LeaveConfirmModal
        open={leaveOpen}
        busy={leaving}
        onClose={() => setLeaveOpen(false)}
        onConfirm={performLeave}
      />

      <audio
        ref={sampleAudioRef}
        onEnded={() => setPlayingSample(null)}
        preload="none"
        style={{ display: "none" }}
      />
    </div>
  );
}

const PHASE_ORDER: Phase[] = [
  "LOBBY",
  "REVEAL",
  "PRODUCTION",
  "UPLOAD",
  "VOTING",
  "RESULTS",
];
const PHASE_LABELS: Record<Phase, string> = {
  LOBBY: "LOBBY",
  REVEAL: "REVEAL",
  PRODUCTION: "PRODUCE",
  UPLOAD: "UPLOAD",
  VOTING: "VOTE",
  RESULTS: "RESULT",
  CANCELLED: "—",
};

function PhaseSteps({ phase }: { phase: Phase }) {
  if (phase === "CANCELLED") return null;
  const activeIdx = PHASE_ORDER.indexOf(phase);
  return (
    <div className={styles.phaseSteps} aria-label={`Phase ${phase}`}>
      {PHASE_ORDER.map((p, i) => {
        const state =
          i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
        return (
          <div key={p} className={styles.phaseStep} data-state={state}>
            <span className={styles.phaseStepDot}>{i + 1}</span>
            <span className={styles.phaseStepLabel}>{PHASE_LABELS[p]}</span>
          </div>
        );
      })}
    </div>
  );
}
