import { describe, expect, it } from "vitest";
import {
  TIMINGS,
  createInitialState,
  phaseDurationMs,
  phoneViewFor,
  reducer,
  targetSequence,
  type GameAction,
  type GameState,
} from "@/game/engine";
import { TARGET_KINDS } from "@/game/levels";

const PHONE = "phone-1";

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(reducer, state);
}

/** Tick exactly to the end of the current phase. */
function finishPhase(state: GameState): GameState {
  const d = phaseDurationMs(state);
  if (d === null) throw new Error(`phase ${state.phase} does not time out`);
  return reducer(state, { type: "tick", now: state.phaseStartedAt + d });
}

function started(): GameState {
  let s = createInitialState(0);
  s = run(
    s,
    { type: "phoneJoined", clientId: PHONE, now: 10 },
    { type: "phoneReady", clientId: PHONE, nickname: "  Ana <b>!! ", now: 20 },
    { type: "phoneStart", clientId: PHONE, runSeed: 1234, now: 30 },
  );
  return s;
}

function toAnswer(s: GameState): GameState {
  while (s.phase !== "answer") s = finishPhase(s);
  return s;
}

function answer(s: GameState, value: number, reactionMs = 1500): GameState {
  return reducer(s, { type: "phoneAnswer", clientId: PHONE, level: s.round!.level, value, reactionMs, now: s.phaseStartedAt + reactionMs });
}

describe("engine", () => {
  it("walks idle -> lobby -> instructions -> tier banner", () => {
    let s = createInitialState(0);
    expect(s.phase).toBe("idle");
    s = reducer(s, { type: "phoneJoined", clientId: PHONE, now: 1 });
    expect(s.phase).toBe("lobby");
    s = reducer(s, { type: "phoneReady", clientId: PHONE, nickname: "Ana", now: 2 });
    expect(s.phase).toBe("instructions");
    expect(s.player?.nickname).toBe("Ana");
    s = reducer(s, { type: "phoneStart", clientId: PHONE, runSeed: 1, now: 3 });
    expect(s.phase).toBe("tier");
    expect(s.round?.level).toBe(1);
  });

  it("sanitises nicknames", () => {
    expect(started().player?.nickname).toBe("Ana b");
  });

  it("rejects a second phone while one is playing", () => {
    const s = started();
    const after = reducer(s, { type: "phoneJoined", clientId: "intruder", now: 40 });
    expect(after).toBe(s);
  });

  it("advances on an exact answer and ends on a miss", () => {
    let s = toAnswer(started());
    expect(phoneViewFor(s)).toMatchObject({ screen: "answer", level: 1 });
    s = answer(s, s.round!.count);
    expect(s.phase).toBe("reveal");
    expect(s.history[0].correct).toBe(true);
    expect(s.score).toBeGreaterThan(0);
    s = finishPhase(s);
    expect(s.phase).toBe("intro");
    expect(s.round!.level).toBe(2);

    s = toAnswer(s);
    s = answer(s, s.round!.count + 1);
    expect(s.history[1].correct).toBe(false);
    expect(phoneViewFor(s)).toMatchObject({ screen: "reveal", gameOver: true });
    s = finishPhase(s);
    expect(s.phase).toBe("results");
    s = finishPhase(s);
    expect(s.phase).toBe("leaderboard");
    s = finishPhase(s);
    expect(s.phase).toBe("idle");
    expect(s.player).toBeNull();
    expect(s.session).toBe(1);
  });

  it("treats an expired answer window as a miss", () => {
    let s = toAnswer(started());
    s = finishPhase(s);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]).toMatchObject({ answer: null, reactionMs: null, accuracy: 0, points: 0, correct: false });
  });

  it("ignores answers for the wrong level or outside the answer phase", () => {
    const s = toAnswer(started());
    expect(reducer(s, { type: "phoneAnswer", clientId: PHONE, level: 7, value: 1, reactionMs: 1, now: 1 })).toBe(s);
    const intro = finishPhase(started());
    expect(reducer(intro, { type: "phoneAnswer", clientId: PHONE, level: 1, value: 1, reactionMs: 1, now: 1 })).toBe(intro);
  });

  it("shows a tier banner when entering levels 6, 11 and 16 and completes after 20", () => {
    let s = started();
    const banners: number[] = [];
    for (let level = 1; level <= 20; level++) {
      if (s.phase === "tier") banners.push(s.round!.level);
      s = toAnswer(s);
      s = answer(s, s.round!.count);
      s = finishPhase(s);
    }
    expect(banners).toEqual([1, 6, 11, 16]);
    expect(s.phase).toBe("results");
    expect(s.history).toHaveLength(20);
    expect(s.history.every((r) => r.correct)).toBe(true);
  });

  it("drops a silent phone from the lobby", () => {
    let s = reducer(createInitialState(0), { type: "phoneJoined", clientId: PHONE, now: 0 });
    s = reducer(s, { type: "tick", now: 25000 });
    expect(s.phase).toBe("idle");
  });

  it("keeps a run going when the transport blips", () => {
    let s = toAnswer(started());
    s = reducer(s, { type: "phoneLeft", clientId: PHONE, explicit: false, now: s.phaseStartedAt + 10 });
    expect(s.phase).toBe("answer");
    expect(s.player?.connected).toBe(false);
    s = reducer(s, { type: "phoneJoined", clientId: PHONE, now: s.phaseStartedAt + 20 });
    expect(s.player?.connected).toBe(true);
  });

  it("scales timers for tests", () => {
    const s = { ...started(), timeScale: 0.1 };
    expect(phaseDurationMs(s)).toBeCloseTo(TIMINGS.tierMs * 0.1);
  });

  it("varies targets without repeating back to back and covers all kinds per tier", () => {
    for (let seed = 0; seed < 200; seed++) {
      const seq = targetSequence(seed);
      expect(seq).toHaveLength(20);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      for (let t = 0; t < 4; t++) {
        const tier = new Set(seq.slice(t * 5, t * 5 + 5));
        expect(tier.size).toBe(TARGET_KINDS.length);
      }
    }
  });
});
