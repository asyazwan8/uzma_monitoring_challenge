import { describe, expect, it } from "vitest";
import {
  TIMINGS,
  boundedReactionMs,
  createInitialState,
  phaseDurationMs,
  phoneViewFor,
  reducer,
  targetSequence,
  type GameAction,
  type GameState,
} from "@/game/engine";
import { LIVES, ROUND_MS, TARGET_KINDS } from "@/game/levels";

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

function toLive(s: GameState): GameState {
  while (s.phase !== "live") s = finishPhase(s);
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

  it("advances on an exact answer; a miss costs a life and play moves on", () => {
    let s = toLive(started());
    expect(s.lives).toBe(LIVES);
    expect(phoneViewFor(s)).toEqual({
      screen: "answer",
      level: 1,
      tier: "easy",
      target: s.round!.target,
      roundId: s.phaseStartedAt,
      windowMs: ROUND_MS,
    });
    s = answer(s, s.round!.count);
    expect(s.phase).toBe("reveal");
    expect(s.history[0].correct).toBe(true);
    expect(s.lives).toBe(3);
    expect(s.score).toBeGreaterThan(0);
    s = finishPhase(s);
    expect(s.phase).toBe("intro");
    expect(s.round!.level).toBe(2);

    // Three misses in a row: lives 2, 1, then 0 and the run ends.
    for (const [level, livesLeft] of [
      [2, 2],
      [3, 1],
      [4, 0],
    ]) {
      s = toLive(s);
      expect(s.round!.level).toBe(level);
      s = answer(s, s.round!.count + 1);
      expect(s.history[s.history.length - 1].correct).toBe(false);
      expect(s.lives).toBe(livesLeft);
      expect(phoneViewFor(s)).toMatchObject({ screen: "reveal", gameOver: livesLeft === 0, livesLeft });
      s = finishPhase(s);
    }
    expect(s.phase).toBe("results");
    expect(s.history).toHaveLength(4);
    s = finishPhase(s);
    expect(s.phase).toBe("leaderboard");
    s = finishPhase(s);
    expect(s.phase).toBe("idle");
    expect(s.player).toBeNull();
    expect(s.session).toBe(1);
  });

  it("a timeout also costs a life", () => {
    let s = toLive(started());
    s = finishPhase(s);
    expect(s.phase).toBe("reveal");
    expect(s.lives).toBe(LIVES - 1);
    s = finishPhase(s);
    expect(s.round!.level).toBe(2);
  });

  it("ends after level 20 even with lives left, and resets lives for the next run", () => {
    let s = started();
    for (let level = 1; level <= 20; level++) {
      s = toLive(s);
      // Miss level 7 and 13, clear the rest.
      s = answer(s, level === 7 || level === 13 ? s.round!.count + 1 : s.round!.count);
      s = finishPhase(s);
    }
    expect(s.phase).toBe("results");
    expect(s.lives).toBe(1);
    expect(s.history.filter((r) => r.correct)).toHaveLength(18);
    // Back to idle and a new run starts with full lives.
    s = finishPhase(finishPhase(s));
    expect(s.phase).toBe("idle");
    expect(s.lives).toBe(LIVES);
  });

  it("goes straight from the intro countdown to the live round", () => {
    let s = started();
    const phases: string[] = [s.phase];
    while (s.phase !== "live") {
      s = finishPhase(s);
      phases.push(s.phase);
    }
    expect(phases).toEqual(["tier", "intro", "live"]);
    expect(phaseDurationMs(s)).toBe(ROUND_MS + TIMINGS.answerGraceMs);
    const intro = finishPhase(started());
    expect(phoneViewFor(intro)).toMatchObject({ screen: "watch", stage: "intro" });
    expect(phoneViewFor(started())).toMatchObject({ screen: "watch", stage: "tier" });
  });

  it("ends the live round as soon as the phone answers", () => {
    const s = toLive(started());
    const after = answer(s, s.round!.count, 2000);
    expect(after.phase).toBe("reveal");
    expect(after.phaseStartedAt).toBe(s.phaseStartedAt + 2000);
    expect(after.history[0].reactionMs).toBe(2000);
  });

  it("accepts answers until the grace period ends, then the round is a miss", () => {
    const s = toLive(started());
    const lastMoment = s.phaseStartedAt + ROUND_MS + TIMINGS.answerGraceMs - 1;
    const late = reducer(s, { type: "phoneAnswer", clientId: PHONE, level: 1, value: s.round!.count, reactionMs: 9900, now: lastMoment });
    expect(late.phase).toBe("reveal");
    expect(late.history[0].correct).toBe(true);
    // Bounded below by the display clock minus the latency allowance.
    expect(late.history[0].reactionMs).toBe(ROUND_MS + TIMINGS.answerGraceMs - 1 - TIMINGS.latencyAllowanceMs);
    const ticked = reducer(s, { type: "tick", now: lastMoment + 1 });
    expect(ticked.phase).toBe("reveal");
    const ignored = reducer(ticked, { type: "phoneAnswer", clientId: PHONE, level: 1, value: s.round!.count, reactionMs: 9900, now: lastMoment + 2 });
    expect(ignored).toBe(ticked);
  });

  it("bounds the phone's answer time by the display clock", () => {
    const s = toLive(started());
    // A forged or reset phone clock cannot claim an instant answer 8 s in.
    expect(boundedReactionMs(s, 0, s.phaseStartedAt + 8000)).toBe(8000 - TIMINGS.latencyAllowanceMs);
    // Network delay up to the allowance is forgiven.
    expect(boundedReactionMs(s, 2000, s.phaseStartedAt + 3000)).toBe(2000);
    // A phone cannot report more time than has passed, or more than the window.
    expect(boundedReactionMs(s, 5000, s.phaseStartedAt + 3000)).toBe(3000);
    expect(boundedReactionMs(s, ROUND_MS * 2, s.phaseStartedAt + ROUND_MS + 1000)).toBe(ROUND_MS);
    expect(boundedReactionMs(s, Number.NaN, s.phaseStartedAt + 4000)).toBe(4000);
  });

  it("scores test-speed runs like real ones", () => {
    const s = toLive({ ...started(), timeScale: 0.25 });
    const after = answer(s, s.round!.count, 1000);
    // 1 s at quarter speed is 4 s of game time.
    expect(after.history[0].reactionMs).toBe(4000);
    expect(phoneViewFor(s)).toMatchObject({ screen: "answer", windowMs: ROUND_MS * 0.25 });
  });

  it("keeps the round clock when the phone pings or rejoins mid-round", () => {
    const s = toLive(started());
    const seen = reducer(s, { type: "phoneSeen", clientId: PHONE, now: s.phaseStartedAt + 3000 });
    const rejoined = reducer(seen, { type: "phoneJoined", clientId: PHONE, now: s.phaseStartedAt + 4000 });
    for (const x of [seen, rejoined]) {
      expect(x.phase).toBe("live");
      expect(x.phaseStartedAt).toBe(s.phaseStartedAt);
      expect(phoneViewFor(x)).toEqual(phoneViewFor(s));
    }
  });

  it("treats an expired answer window as a miss", () => {
    let s = toLive(started());
    s = finishPhase(s);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]).toMatchObject({ answer: null, reactionMs: null, accuracy: 0, points: 0, correct: false });
  });

  it("ignores answers for the wrong level or outside the answer phase", () => {
    const s = toLive(started());
    expect(reducer(s, { type: "phoneAnswer", clientId: PHONE, level: 7, value: 1, reactionMs: 1, now: 1 })).toBe(s);
    expect(reducer(s, { type: "phoneAnswer", clientId: PHONE, level: 0, value: 1, reactionMs: 1, now: 1 })).toBe(s);
    const intro = finishPhase(started());
    expect(reducer(intro, { type: "phoneAnswer", clientId: PHONE, level: 1, value: 1, reactionMs: 1, now: 1 })).toBe(intro);
  });

  it("shows a tier banner when entering levels 6, 11 and 16 and completes after 20", () => {
    let s = started();
    const banners: number[] = [];
    for (let level = 1; level <= 20; level++) {
      if (s.phase === "tier") banners.push(s.round!.level);
      s = toLive(s);
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
    let s = toLive(started());
    s = reducer(s, { type: "phoneLeft", clientId: PHONE, explicit: false, now: s.phaseStartedAt + 10 });
    expect(s.phase).toBe("live");
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
