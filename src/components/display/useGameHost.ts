"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { createInitialState, phaseDurationMs, phoneViewFor, reducer, type GameState } from "@/game/engine";
import { TOTAL_LEVELS } from "@/game/levels";
import { isPhoneMessage, type DisplayToPhone, type GameMessage } from "@/game/protocol";
import { summarise } from "@/game/scoring";
import { createLeaderboard, type LeaderboardEntry, type LeaderboardRepository } from "@/leaderboard";
import { randomSeed } from "@/lib/id";
import { createTransport, type Transport, type TransportStatus } from "@/realtime";

export interface HostOptions {
  /** < 1 speeds every timer up (automated tests). */
  timeScale: number;
}

export interface GameHost {
  state: GameState;
  transportStatus: TransportStatus;
  board: LeaderboardEntry[];
  /** The leaderboard row the current run produced. */
  lastEntry: LeaderboardEntry | null;
  reset: () => void;
}

/**
 * Runs the authoritative game: owns the reducer, talks to the phone through the
 * transport, drives phase timers and records finished runs on the leaderboard.
 */
export function useGameHost({ timeScale }: HostOptions): GameHost {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(Date.now(), timeScale));
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const transportRef = useRef<Transport | null>(null);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>("connecting");
  const repo = useMemo<LeaderboardRepository | null>(() => (typeof window === "undefined" ? null : createLeaderboard()), []);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [lastEntry, setLastEntry] = useState<LeaderboardEntry | null>(null);

  const send = useCallback((msg: DisplayToPhone) => transportRef.current?.send(msg), []);
  const sendView = useCallback(() => {
    const s = stateRef.current;
    if (s.player) send({ type: "view", to: s.player.clientId, view: phoneViewFor(s) });
  }, [send]);

  // One transport per room; the room code rotates every time the game returns to idle.
  useEffect(() => {
    const transport = createTransport(state.roomCode, "display");
    transportRef.current = transport;
    const offStatus = transport.onStatus(setTransportStatus);
    const offMessage = transport.onMessage((msg: GameMessage) => {
      if (!isPhoneMessage(msg)) return;
      const now = Date.now();
      const current = stateRef.current;
      switch (msg.type) {
        case "join": {
          const busy = current.player !== null && current.player.clientId !== msg.clientId;
          const late = current.player === null && current.phase !== "idle";
          if (busy || late) {
            transport.send({ type: "welcome", to: msg.clientId, accepted: false, reason: "busy" });
            return;
          }
          dispatch({ type: "phoneJoined", clientId: msg.clientId, now });
          transport.send({ type: "welcome", to: msg.clientId, accepted: true });
          // A rejoining phone gets its current screen straight away.
          sendView();
          return;
        }
        case "ready":
          return dispatch({ type: "phoneReady", clientId: msg.clientId, nickname: msg.nickname, now });
        case "start":
          return dispatch({ type: "phoneStart", clientId: msg.clientId, runSeed: randomSeed(), now });
        case "answer":
          return dispatch({ type: "phoneAnswer", clientId: msg.clientId, level: msg.level, value: msg.value, reactionMs: msg.reactionMs, now });
        case "ping":
          dispatch({ type: "phoneSeen", clientId: msg.clientId, now });
          // Re-sync the phone on every heartbeat in case a view message was lost.
          if (stateRef.current.player?.clientId === msg.clientId) sendView();
          return;
        case "leave":
          return dispatch({ type: "phoneLeft", clientId: msg.clientId, explicit: true, now });
      }
    });
    return () => {
      offStatus();
      offMessage();
      transport.close();
      if (transportRef.current === transport) transportRef.current = null;
    };
  }, [state.roomCode, sendView]);

  // Push the phone's view whenever it changes.
  const viewKey = state.player ? JSON.stringify(phoneViewFor(state)) : "";
  useEffect(() => {
    if (viewKey) sendView();
  }, [viewKey, sendView]);

  // Phase timer (exact) plus a slow heartbeat tick for idle-phone checks.
  useEffect(() => {
    const duration = phaseDurationMs(state);
    if (duration === null) return;
    const wait = Math.max(0, state.phaseStartedAt + duration - Date.now());
    const t = setTimeout(() => dispatch({ type: "tick", now: Date.now() }), wait + 5);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000);
    return () => clearInterval(t);
  }, []);

  // Leaderboard: load on mount, record each finished run once.
  const refreshBoard = useCallback(() => repo?.top(10).then(setBoard), [repo]);
  useEffect(() => {
    let live = true;
    repo?.top(10).then((entries) => live && setBoard(entries));
    return () => {
      live = false;
    };
  }, [repo]);
  const recordedRun = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== "results" || !repo || !state.player?.nickname) return;
    if (recordedRun.current === state.runSeed) return;
    recordedRun.current = state.runSeed;
    const summary = summarise(state.history, TOTAL_LEVELS);
    void repo
      .submit({
        nickname: state.player.nickname,
        score: summary.score,
        levelsCleared: summary.levelsCleared,
        accuracyPct: summary.accuracyPct,
        avgReactionMs: summary.avgReactionMs,
      })
      .then(({ entry, rank }) => {
        setLastEntry(entry);
        dispatch({ type: "rankResolved", rank });
        return refreshBoard();
      });
  }, [state.phase, state.runSeed, state.history, state.player, repo, refreshBoard]);

  const reset = useCallback(() => dispatch({ type: "reset", now: Date.now() }), []);
  return { state, transportStatus, board, lastEntry: state.phase === "idle" ? null : lastEntry, reset };
}
