"use client";

import { useEffect, useState } from "react";
import { useGameAudio } from "@/audio/useGameAudio";
import { phaseDurationMs } from "@/game/engine";
import { TOTAL_LEVELS } from "@/game/levels";
import { summarise } from "@/game/scoring";
import { hashSeed } from "@/lib/rng";
import { joinUrl, resolvePublicBase } from "@/lib/joinUrl";
import { useNow } from "@/lib/useNow";
import { GameScreen } from "./GameScreen";
import { IdleScreen } from "./IdleScreen";
import { InstructionsScreen } from "./InstructionsScreen";
import { LeaderboardScreen } from "./LeaderboardScreen";
import { ResultsScreen } from "./ResultsScreen";
import { Stage } from "./Stage";
import { useGameHost } from "./useGameHost";

declare global {
  interface Window {
    __MC__?: { state: unknown };
  }
}

export interface DisplayAppProps {
  debug: boolean;
  timeScale: number;
  /** Music and sound effects (off with ?sound=0). */
  sound: boolean;
}

export function DisplayApp({ debug, timeScale, sound }: DisplayAppProps) {
  const { state, board, lastEntry, reset, transportStatus } = useGameHost({ timeScale });
  const audio = useGameAudio(state, { enabled: sound, debug });
  const [base, setBase] = useState<string | null>(null);
  const now = useNow(1000);

  useEffect(() => {
    void resolvePublicBase().then(setBase);
  }, []);

  // Staff shortcut: Esc returns to the attract screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && reset();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  useEffect(() => {
    if (debug) window.__MC__ = { state };
  }, [debug, state]);

  // New backdrop every session and every ~45 s while idle, so the attract loop never looks static.
  const backdropSeed = hashSeed(state.session, Math.floor(now / 45000));
  const url = base ? joinUrl(base, state.roomCode) : null;
  const nickname = state.player?.nickname ?? "";
  const summary = summarise(state.history, TOTAL_LEVELS);

  let screen: React.ReactNode;
  switch (state.phase) {
    case "idle":
    case "lobby":
      screen = (
        <IdleScreen
          roomCode={state.roomCode}
          url={url}
          board={board}
          phoneConnected={state.phase === "lobby"}
          backdropSeed={backdropSeed}
        />
      );
      break;
    case "instructions":
      screen = <InstructionsScreen nickname={nickname} backdropSeed={state.session} />;
      break;
    case "results":
      screen = <ResultsScreen nickname={nickname} summary={summary} rank={state.rank} backdropSeed={state.session} />;
      break;
    case "leaderboard": {
      const left = Math.max(0, Math.ceil(((phaseDurationMs(state) ?? 0) - (now - state.phaseStartedAt)) / 1000));
      screen = (
        <LeaderboardScreen
          board={board}
          highlightId={lastEntry?.id ?? null}
          rank={state.rank}
          self={lastEntry}
          secondsLeft={left}
          backdropSeed={state.session}
        />
      );
      break;
    }
    default:
      screen = <GameScreen state={state} debug={debug} />;
  }

  return (
    <Stage>
      {screen}
      {sound && <SoundStatus status={audio.status} muted={audio.muted} hint={debug || state.phase === "idle" || state.phase === "lobby"} />}
      {transportStatus !== "open" && (
        <div className="absolute right-[24px] top-[16px] rounded bg-geo-orange px-3 py-1 text-[13px] font-bold uppercase tracking-[0.08em]">
          Relay offline: start it with npm run relay
        </div>
      )}
    </Stage>
  );
}

/**
 * Bottom-right corner of the stage, clear of the map and HUD. Browsers keep
 * audio locked until someone clicks or presses a key on the display, so the
 * hint shows on the attract screen until then (or use the kiosk autoplay flag).
 */
function SoundStatus({ status, muted, hint }: { status: string; muted: boolean; hint: boolean }) {
  if (status === "running" && !muted) return null;
  if (status === "locked" && !hint) return null;
  return (
    <div
      className="geo-caption absolute bottom-[14px] right-[20px] flex items-center gap-2 rounded-[4px] bg-geo-panel/90 px-3 py-1.5 text-[12px] text-white/75"
      data-testid="sound-status"
      data-status={status}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
        {muted || status !== "running" ? (
          <path d="M11 6l4 4M15 6l-4 4" stroke="#F26522" strokeWidth="1.6" strokeLinecap="round" />
        ) : null}
      </svg>
      {muted ? "Sound off · M" : "Click or press any key to enable sound"}
    </div>
  );
}
