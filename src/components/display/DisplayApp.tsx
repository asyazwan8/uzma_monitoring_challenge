"use client";

import { useEffect, useState } from "react";
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
      {transportStatus !== "open" && (
        <div className="absolute right-[24px] top-[16px] rounded bg-geo-orange px-3 py-1 text-[13px] font-bold uppercase tracking-[0.08em]">
          Relay offline: start it with npm run relay
        </div>
      )}
    </Stage>
  );
}
