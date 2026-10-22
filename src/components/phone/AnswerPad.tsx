"use client";

import { useRef, useState } from "react";
import { TargetIcon } from "@/components/brand/TargetIcon";
import { TARGET_LABELS } from "@/game/levels";
import type { PhoneView } from "@/game/protocol";
import { pad2 } from "@/lib/format";
import { useNow } from "@/lib/useNow";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

/** Elapsed round time reported by the display when this phone (re)joined mid-round. */
export interface RoundClock {
  roundId: number;
  elapsedMs: number;
  /** Phone wall time when the clock message arrived. */
  receivedWall: number;
}

/**
 * Numeric keypad, open while the tile is on the big screen. Answer time is
 * measured here, from the keypad opening to the tap on SUBMIT, so network
 * latency never counts against the player; the display bounds it by its own clock.
 */
export function AnswerPad({
  view,
  clock,
  onSubmit,
}: {
  view: Extract<PhoneView, { screen: "answer" }>;
  clock: RoundClock | null;
  onSubmit: (value: number, reactionMs: number) => void;
}) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [openedAt] = useState(() => ({ perf: performance.now(), wall: Date.now() }));
  const now = useNow(100);
  // A keypad that mounted late (phone reloaded mid-round) catches up with the display.
  const offset =
    clock && clock.roundId === view.roundId ? Math.max(0, clock.elapsedMs - (clock.receivedWall - openedAt.wall)) : 0;
  const remaining = Math.max(0, view.windowMs - (now - openedAt.wall) - offset);
  const timedOut = remaining <= 0 && submitted === null;
  const locked = submitted !== null || timedOut;
  const submitLock = useRef(false);

  const press = (key: (typeof KEYS)[number]) => {
    if (locked) return;
    navigator.vibrate?.(8);
    if (key === "back") setValue((v) => v.slice(0, -1));
    else if (key === "clear") setValue("");
    else setValue((v) => (v.length >= 3 ? v : v === "0" ? key : v + key));
  };

  const submit = () => {
    if (locked || value === "" || submitLock.current) return;
    submitLock.current = true;
    const n = Number(value);
    navigator.vibrate?.(20);
    setSubmitted(n);
    onSubmit(n, performance.now() - openedAt.perf + offset);
  };

  return (
    <div className="flex flex-1 flex-col" data-testid="answer-pad">
      <div className="flex items-center gap-3">
        <TargetIcon kind={view.target} size={40} className="rounded-[4px]" />
        <div className="min-w-0 flex-1">
          <p className="geo-caption text-[11px] text-white/60">Level {pad2(view.level)} · Count the</p>
          <p className="geo-h truncate text-[20px] leading-tight">{TARGET_LABELS[view.target].plural}</p>
        </div>
        <p className={`tabular text-[28px] font-extrabold ${remaining < 3000 && !locked ? "text-geo-orange" : ""}`}>
          {Math.ceil(remaining / 1000)}s
        </p>
      </div>
      <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-white/15">
        <div className="h-full bg-geo-orange" style={{ width: `${(remaining / view.windowMs) * 100}%` }} />
      </div>

      <div className="mt-5 flex h-[110px] items-center justify-center rounded-[6px] border-2 border-white/15 bg-geo-panel" data-testid="answer-value">
        <span className={`tabular text-[72px] font-extrabold leading-none ${value ? "" : "text-white/25"}`}>{value || "–"}</span>
      </div>

      {locked ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="geo-kicker text-[13px]">{timedOut ? "Time's up" : "Answer locked"}</p>
          <p className="geo-h mt-2 text-[24px]">{timedOut ? "No answer sent" : `You said ${submitted}`}</p>
          <p className="mt-2 text-[15px] text-white/60">Watch the big screen for the reveal.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid flex-1 grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className={`min-h-[60px] rounded-[6px] text-[30px] font-bold active:bg-white/25 ${
                  k === "clear" || k === "back" ? "bg-white/5 text-[15px] font-extrabold uppercase tracking-[0.08em] text-white/70" : "bg-white/10"
                }`}
                data-key={k}
                aria-label={k === "back" ? "Delete" : k === "clear" ? "Clear" : k}
              >
                {k === "back" ? "⌫" : k === "clear" ? "Clr" : k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={value === ""}
            className="mt-3 w-full rounded-[4px] bg-geo-orange py-5 text-[20px] font-extrabold uppercase tracking-[0.12em] text-white active:bg-geo-orange-hover disabled:opacity-35"
            data-testid="submit-answer"
          >
            Submit
          </button>
        </>
      )}
    </div>
  );
}
