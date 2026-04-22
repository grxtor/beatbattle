"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sketch from "@/components/Sketch";
import { useToast } from "@/components/Toast";
import RoomChat from "./RoomChat";
import TrackPlayer from "./TrackPlayer";
import styles from "./page.module.css";

type Phase = "LOBBY" | "REVEAL" | "PRODUCTION" | "UPLOAD" | "VOTING" | "RESULTS" | "CANCELLED";
type VoteRating = "INSANE" | "VERY_GOOD" | "GOOD" | "OKAY" | "BAD" | "VERY_BAD";

type RoomPlayer = {
  id: string;
  userId: string;
  isHost: boolean;
  isReady: boolean;
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
};

type BattleResult = {
  place: number;
  trackScore: number;
  xpAwarded: number;
  coinsAwarded: number;
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
    samples: { name: string; duration: string }[] | null;
    host: { id: string; username: string; initials: string; level: number };
    players: RoomPlayer[];
    tracks: Track[];
    results: BattleResult[];
  };
  me: { id: string; username: string; inRoom: boolean; submitted: boolean };
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

export default function BattleRoom({ code: rawCode }: BattleRoomProps) {
  const router = useRouter();
  const toast = useToast();
  const code = rawCode.toUpperCase();

  const [data, setData] = useState<RoomResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [inviteCopied, setInviteCopied] = useState(false);
  const [playingSample, setPlayingSample] = useState<number | null>(null);
  const [voteTrackIdx, setVoteTrackIdx] = useState(0);
  const [localVotes, setLocalVotes] = useState<
    Record<string, { rating: VoteRating; locked: boolean }>
  >({});
  const [voteErr, setVoteErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const pollingRef = useRef<number | null>(null);

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

  /* --- auto-join if not in room --- */

  useEffect(() => {
    if (!data || data.me.inRoom || joining) return;
    if (data.room.phase !== "LOBBY") return; // battle already running — do not join
    setJoining(true);
    fetch(`/api/rooms/${code}/join`, { method: "POST" })
      .then(() => load())
      .finally(() => setJoining(false));
  }, [data, code, load, joining]);

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

  const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
  const ACCEPTED_MIMES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg"];

  const pickFile = () => {
    if (uploadBusy || me?.submitted) return;
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
        const pct = await new Promise<number>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/rooms/${code}/track`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadPct(Math.round((e.loaded / e.total) * 100));
            }
          };
          xhr.onload = () => {
            let body: { error?: string } = {};
            try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(100);
            } else {
              reject(new Error(body.error ?? `HTTP ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("network error"));
          xhr.send(form);
        });
        setUploadPct(pct);
        toast.success("Track uploaded");
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "upload failed");
      } finally {
        setUploadBusy(false);
        setUploadPct(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [code, load, toast, me?.submitted],
  );

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void uploadTrack(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (uploadBusy || me?.submitted) return;
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
    } catch {
      setVoteErr("connection error");
    }
  };

  const leave = async () => {
    await fetch(`/api/rooms/${code}/leave`, { method: "POST" });
    router.push("/");
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
        <button onClick={leave} className={styles.leaveLink} style={{ border: "none", background: "none" }}>
          ← LEAVE
        </button>
      </div>

      <PhaseSteps phase={phase} />

      {/* ===================== LOBBY ===================== */}
      {phase === "LOBBY" && (
        <div className={styles.lobby}>
          <Sketch variant={1} className={styles.lobbyCol}>
            <div className={styles.colTitle}>
              <span>PLAYERS</span>
              <span>{room.players.length} / {room.maxPlayers}</span>
            </div>
            <div className={styles.playerGrid}>
              {room.players.map((p) => (
                <div
                  key={p.id}
                  className={`${styles.pSlot} ${p.isHost ? styles.host : ""} ${p.isReady ? styles.ready : ""}`}
                >
                  <div className={styles.pAvatar}>{p.user.initials}</div>
                  <div className={styles.pBody}>
                    <span className={styles.pName}>@{p.user.username}</span>
                    <span className={`${styles.pSub} ${p.isReady ? styles.ok : ""}`}>
                      {p.isHost ? <>LVL {p.user.level} · <b>HOST</b></> :
                       p.isReady ? <>LVL {p.user.level} · <b>READY</b></> :
                       <>LVL {p.user.level} · waiting</>}
                    </span>
                  </div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }, (_, i) => (
                <div key={`empty-${i}`} className={`${styles.pSlot} ${styles.empty}`}>
                  + WAITING
                </div>
              ))}
            </div>
          </Sketch>

          <Sketch variant={2} className={styles.lobbyCol}>
            <div className={styles.colTitle}><span>ROOM SETTINGS</span></div>
            <div className={styles.lobbyInfo}>
              <span>GENRE</span><b>{genreDisplay(room.genre)}</b>
              <span>LENGTH</span><b>{room.lengthMin} MINUTES</b>
              <span>DIFFICULTY</span><b>{room.difficulty}</b>
              <span>PRIVACY</span><b>{room.privacy}</b>
              <span>HOST</span><b>@{room.host.username}</b>
            </div>

            <div className={styles.colTitle}><span>INVITE LINK</span></div>
            <div className={styles.inviteRow}>
              <input readOnly value={inviteUrl} />
              <button
                className={`${styles.miniBtn} ${inviteCopied ? styles.ok : ""}`}
                onClick={copyInvite}
              >
                {inviteCopied ? "✓" : "COPY"}
              </button>
            </div>

            <div className={styles.readyRow}>
              <button
                className={`${styles.readyBtn} ${amReady ? styles.on : ""}`}
                onClick={toggleReady}
              >
                {amReady ? "✓ READY" : "NOT READY"}
              </button>
            </div>

            {isHost && (
              <button className={styles.lobbyCta} onClick={start}>
                START BATTLE →
              </button>
            )}
          </Sketch>
        </div>
      )}

      {/* ===================== REVEAL ===================== */}
      {phase === "REVEAL" && (
        <Sketch variant={1} className={styles.reveal}>
          <span className={styles.phaseKicker}>SAMPLES DROPPED</span>
          <h2 className={styles.phaseTitle}>GET <span>READY</span></h2>
          <div className={styles.bigTimer}>{fmtCountdown(countdown ?? 0)}</div>

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
                >
                  {playingSample === i ? "■ STOP" : "▸ PLAY"}
                </button>
              </Sketch>
            ))}
          </div>
        </Sketch>
      )}

      {/* ===================== PRODUCTION ===================== */}
      {phase === "PRODUCTION" && (
        <div className={styles.production}>
          <Sketch variant={1} className={styles.prodMain}>
            <span className={styles.prodLabel}>PRODUCE YOUR BEAT</span>
            <div className={`${styles.prodTimer} ${(countdown ?? 0) < 11 ? styles.warn : ""}`}>
              {fmtCountdown(countdown ?? 0)}
            </div>
            <p className={styles.prodTip}>
              Use all 4 samples for bonus XP. Your DAW is ready — flip it before the clock hits zero.
            </p>
            <button
              className={styles.uploadCta}
              disabled={me.submitted || uploadBusy}
              onClick={pickFile}
            >
              {me.submitted
                ? "✓ SUBMITTED"
                : uploadBusy
                ? `UPLOADING… ${uploadPct}%`
                : "UPLOAD TRACK →"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
              onChange={onFileSelected}
              hidden
            />
          </Sketch>

          <Sketch variant={2} className={styles.prodSide}>
            <div className={styles.prodSideTitle}>SAMPLES · REPLAY</div>
            {samples.map((s, i) => (
              <div key={s.name} className={styles.miniSample}>
                <div className={styles.miniSampleBody}>
                  <span className={styles.miniSampleName}>{s.name}</span>
                  <span className={styles.miniSampleDur}>{s.duration}</span>
                </div>
                <button
                  className={styles.miniPlay}
                  onClick={() => setPlayingSample(playingSample === i ? null : i)}
                >
                  {playingSample === i ? "■" : "▸"}
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
          <div className={styles.bigTimer}>{fmtCountdown(countdown ?? 0)}</div>

          <Sketch
            variant={2}
            as="div"
            className={`${styles.dropzone} ${me.submitted ? styles.done : ""}`}
            onClick={pickFile}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <div className={`${styles.dropIcon} ${me.submitted ? styles.done : ""}`}>
              {me.submitted ? "✓" : uploadBusy ? "…" : "↑"}
            </div>
            <span className={`${styles.dropText} ${me.submitted ? styles.ok : ""}`}>
              {me.submitted
                ? "TRACK SUBMITTED"
                : uploadBusy
                ? `UPLOADING ${uploadPct}%`
                : "DROP OR CLICK TO UPLOAD"}
            </span>
            <span className={styles.dropHint}>
              {me.submitted
                ? "Waiting for other producers to finish."
                : "mp3 / wav / ogg · max 30 MB"}
            </span>
          </Sketch>
          {!me.submitted && (
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
              onChange={onFileSelected}
              hidden
            />
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
        </Sketch>
      )}

      {/* ===================== VOTING ===================== */}
      {phase === "VOTING" && currentVoteTrack && (
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
            Time left: {fmtCountdown(countdown ?? 0)}
          </div>
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
            {room.results.map((r) => (
              <div
                key={r.user.id}
                className={`${styles.resultRow} ${r.user.id === me.id ? styles.me : ""}`}
              >
                <span className={styles.resultRank}>#{r.place}</span>
                <div className={styles.resultAv}>{r.user.initials}</div>
                <span className={`${styles.resultName} ${r.user.id === me.id ? styles.me : ""}`}>
                  @{r.user.username}{r.user.id === me.id && " (YOU)"}
                </span>
                <span className={styles.resultScore}>LVL {r.user.level}</span>
                <span className={styles.resultXp}>+{r.xpAwarded} XP · +{r.coinsAwarded} ¢</span>
              </div>
            ))}
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

      {me.inRoom && phase !== "CANCELLED" && (
        <RoomChat code={code} meId={me.id} />
      )}
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
