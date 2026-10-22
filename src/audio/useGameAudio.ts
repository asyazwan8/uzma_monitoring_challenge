"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { GameState } from "@/game/engine";
import { cuesFor, musicAnchorFor, musicFor, musicFromKey, musicKey, phaseKey } from "./cues";
import { CATCH_UP_ALLOW_S, LATE_ALLOW_S, getGameAudio, type AudioStatus } from "./engine";

/**
 * Sound for the big-screen display. Feed it the game state on every render; it
 * reacts only when the phase instance changes (new phaseKey), never per tick.
 *
 * The last processed phase lives in a ref, which survives StrictMode's
 * unmount/remount, so a cue is scheduled exactly once per phase. The engine is
 * a singleton that outlives this hook; unmounting only silences the music.
 */

export interface GameAudioOptions {
  /** false: never touch Web Audio (phones, tests without sound). */
  enabled: boolean;
  /** Keep a ring buffer of played cues on window.__mcAudio.log. */
  debug?: boolean;
}

export interface GameAudioControls {
  status: AudioStatus;
  muted: boolean;
  toggleMute: () => void;
}

const OFF_SNAPSHOT = "off|0|0";
const noop = () => undefined;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Subscribe to the engine's status/mute snapshot ("status|muted|volume"). */
export function useAudioSnapshot(enabled: boolean): string {
  const subscribe = useCallback(
    (cb: () => void) => (enabled ? (getGameAudio()?.onStatusChange(cb) ?? noop) : noop),
    [enabled],
  );
  const getSnapshot = useCallback(() => (enabled ? (getGameAudio()?.snapshot ?? OFF_SNAPSHOT) : OFF_SNAPSHOT), [enabled]);
  return useSyncExternalStore(subscribe, getSnapshot, () => OFF_SNAPSHOT);
}

/** Staff shortcut: M toggles mute (ignored while typing in a field). */
export function useMuteShortcut(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "m" || e.key === "M") getGameAudio()?.toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export function useGameAudio(state: GameState, opts: GameAudioOptions): GameAudioControls {
  const { enabled, debug = false } = opts;
  const snapshot = useAudioSnapshot(enabled);
  const lastKey = useRef<string | null>(null);
  const prevState = useRef<GameState | null>(null);

  // Create the context straight away; the kiosk flag lets it run without a click.
  useEffect(() => {
    if (!enabled) return;
    const audio = getGameAudio();
    if (!audio) return;
    audio.debug = debug;
    audio.init();
  }, [enabled, debug]);

  // Cues: once per phase instance.
  const key = phaseKey(state);
  useEffect(() => {
    if (!enabled) return;
    if (lastKey.current === key) {
      prevState.current = state;
      return;
    }
    const prev = prevState.current;
    lastKey.current = key;
    prevState.current = state;
    const audio = getGameAudio();
    if (!audio) return;
    audio.beginPhase(key);
    // With no previous state this is a phase already under way (first mount, a
    // reload): cues from its start are stale, so only those still due play.
    const allowLate = prev === null ? CATCH_UP_ALLOW_S : LATE_ALLOW_S;
    for (const c of cuesFor(prev, state)) {
      audio.schedule(c.cue, audio.wallToAudioTime(c.atWallMs), c.params, allowLate);
    }
    const anchor = musicAnchorFor(state);
    if (anchor !== null) audio.alignMusic(audio.wallToAudioTime(anchor));
  }, [enabled, key, state]);

  // Music and the reveal duck follow the phase; the sequencer picks the moment to switch.
  const mKey = musicKey(musicFor(state));
  const reveal = state.phase === "reveal";
  useEffect(() => {
    if (!enabled) return;
    const audio = getGameAudio();
    const mode = musicFromKey(mKey);
    if (!audio || !mode) return;
    audio.setMusic(mode);
    audio.duck("reveal", reveal);
    return () => {
      // Unmount (or StrictMode's rehearsal): fall silent; a remount sets it again.
      audio.setMusic({ kind: "silent" });
      audio.duck("reveal", false);
    };
  }, [enabled, mKey, reveal]);

  useMuteShortcut(enabled);

  const toggleMute = useCallback(() => {
    if (enabled) getGameAudio()?.toggleMute();
  }, [enabled]);

  const [status, muted] = snapshot.split("|");
  return { status: status as AudioStatus, muted: muted === "1", toggleMute };
}
