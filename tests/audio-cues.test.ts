import { describe, expect, it } from "vitest";
import {
  createInitialState,
  makeRound,
  phaseDurationMs,
  reducer,
  targetSequence,
  type GameAction,
  type GameState,
  TIMINGS,
  type PhaseName,
} from "@/game/engine";
import { ROUND_MS, revealStaggerMs, revealVerdictDelayMs } from "@/game/levels";
import {
  cuesFor,
  detectPan,
  musicAnchorFor,
  musicFor,
  musicFromKey,
  musicKey,
  phaseKey,
  type MusicMode,
  type ScheduledCue,
} from "@/audio/cues";
import { BAR, STEP, alignTo, catchUp, createStepState, scheduleRange } from "@/audio/music";

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

function lobby(timeScale = 1): GameState {
  return reducer(createInitialState(0, timeScale), { type: "phoneJoined", clientId: PHONE, now: 10 });
}

function tier(timeScale = 1): GameState {
  return run(
    lobby(timeScale),
    { type: "phoneReady", clientId: PHONE, nickname: "Ana", now: 20 },
    { type: "phoneStart", clientId: PHONE, runSeed: 1234, now: 30 },
  );
}

function until(state: GameState, phase: PhaseName): GameState {
  let s = state;
  for (let guard = 0; s.phase !== phase; guard++) {
    if (guard > 20) throw new Error(`never reached ${phase}`);
    s = finishPhase(s);
  }
  return s;
}

function answer(live: GameState, value: number, afterMs = 1500): GameState {
  return reducer(live, {
    type: "phoneAnswer",
    clientId: PHONE,
    level: live.round!.level,
    value,
    reactionMs: afterMs,
    now: live.phaseStartedAt + afterMs,
  });
}

/** Run a transition and return its cues. */
function step(prev: GameState, next: GameState): ScheduledCue[] {
  return cuesFor(prev, next);
}

const names = (cues: ScheduledCue[]) => cues.map((c) => c.cue);

describe("cuesFor: phase transitions", () => {
  it("lobby: a join chime when the phone connects", () => {
    const idle = createInitialState(0);
    const s = lobby();
    expect(s.phase).toBe("lobby");
    expect(step(idle, s)).toEqual([{ cue: "join", atWallMs: 10 }]);
  });

  it("instructions: no cue", () => {
    const s = lobby();
    const next = reducer(s, { type: "phoneReady", clientId: PHONE, nickname: "Ana", now: 20 });
    expect(next.phase).toBe("instructions");
    expect(step(s, next)).toEqual([]);
  });

  it("tier banner: tierUp at the phase start", () => {
    const s = tier();
    expect(s.phase).toBe("tier");
    const instr = run(lobby(), { type: "phoneReady", clientId: PHONE, nickname: "Ana", now: 20 });
    expect(step(instr, s)).toEqual([{ cue: "tierUp", atWallMs: 30 }]);
  });

  it.each([1, 0.25])("intro: three countdown blips one (scaled) second apart, timeScale %s", (ts) => {
    const t = tier(ts);
    const intro = finishPhase(t);
    expect(intro.phase).toBe("intro");
    const t0 = intro.phaseStartedAt;
    expect(step(t, intro)).toEqual([
      { cue: "countdown", atWallMs: t0, params: { n: 3 } },
      { cue: "countdown", atWallMs: t0 + 1000 * ts, params: { n: 2 } },
      { cue: "countdown", atWallMs: t0 + 2000 * ts, params: { n: 1 } },
    ]);
  });

  it.each([1, 0.5])("live: go, riser, three urgent ticks and time up at the window end, timeScale %s", (ts) => {
    const intro = until(tier(ts), "intro");
    const live = finishPhase(intro);
    expect(live.phase).toBe("live");
    const t0 = live.phaseStartedAt;
    const end = t0 + ROUND_MS * ts;
    const cues = step(intro, live);
    expect(cues).toEqual([
      { cue: "go", atWallMs: t0 },
      { cue: "riser", atWallMs: end - 3000 * ts, params: { durMs: 3000 * ts } },
      { cue: "tickUrgent", atWallMs: end - 3000 * ts },
      { cue: "tickUrgent", atWallMs: end - 2000 * ts },
      { cue: "tickUrgent", atWallMs: end - 1000 * ts },
      { cue: "timeUp", atWallMs: end },
    ]);
    // The riser ends exactly at the window end.
    const riser = cues[1];
    expect(riser.atWallMs + riser.params!.durMs!).toBe(end);
  });

  it.each([1, 0.25])("reveal (correct): lock, one ping per box at the overlay stagger, then correct, timeScale %s", (ts) => {
    const live = until(tier(ts), "live");
    const n = live.round!.count;
    const reveal = answer(live, n);
    expect(reveal.phase).toBe("reveal");
    const t0 = reveal.phaseStartedAt;
    const cues = step(live, reveal);
    expect(cues[0]).toEqual({ cue: "lock", atWallMs: t0 });
    const pings = cues.filter((c) => c.cue === "detect");
    expect(pings).toHaveLength(Math.min(n, 30));
    // Unscaled: the CSS stagger of the detection boxes ignores timeScale.
    pings.forEach((c, i) => {
      expect(c.atWallMs).toBeCloseTo(t0 + i * revealStaggerMs(n), 6);
      expect(c.params).toMatchObject({ i, pan: detectPan(i) });
      expect(c.params!.pan!).toBeGreaterThanOrEqual(-0.6);
      expect(c.params!.pan!).toBeLessThan(0.6);
    });
    expect(cues[cues.length - 1]).toEqual({ cue: "correct", atWallMs: t0 + revealVerdictDelayMs(n) });
    expect(names(cues).filter((c) => c === "correct" || c === "wrong" || c === "timeout")).toEqual(["correct"]);
  });

  it("reveal (wrong): lock then wrong", () => {
    const live = until(tier(), "live");
    const reveal = answer(live, live.round!.count + 1);
    const cues = step(live, reveal);
    expect(cues[0].cue).toBe("lock");
    expect(cues[cues.length - 1]).toEqual({ cue: "wrong", atWallMs: reveal.phaseStartedAt + revealVerdictDelayMs(live.round!.count) });
    expect(names(cues)).not.toContain("timeout");
  });

  it("reveal (timeout): no lock, and the verdict is timeout rather than wrong", () => {
    const live = until(tier(), "live");
    const reveal = finishPhase(live);
    expect(reveal.phase).toBe("reveal");
    expect(reveal.history[reveal.history.length - 1].answer).toBeNull();
    const cues = step(live, reveal);
    expect(names(cues)).not.toContain("lock");
    expect(names(cues)).not.toContain("wrong");
    expect(cues[cues.length - 1]).toEqual({
      cue: "timeout",
      atWallMs: reveal.phaseStartedAt + revealVerdictDelayMs(live.round!.count),
    });
    expect(cues.filter((c) => c.cue === "detect")).toHaveLength(Math.min(live.round!.count, 30));
  });

  it("reveal: detection pings are capped at 30 for big counts", () => {
    const live = until(tier(), "live");
    const big = { ...live, round: { ...live.round!, count: 45 } };
    const reveal = { ...answer(big, 45), round: big.round };
    const cues = step(big, reveal);
    const pings = cues.filter((c) => c.cue === "detect");
    expect(pings).toHaveLength(30);
    expect(pings[29].atWallMs).toBeCloseTo(reveal.phaseStartedAt + 29 * revealStaggerMs(45), 6);
    expect(cues[cues.length - 1]).toEqual({ cue: "correct", atWallMs: reveal.phaseStartedAt + revealVerdictDelayMs(45) });
  });

  it("results: a resolving chord; leaderboard and idle are silent", () => {
    const live = until(tier(), "live");
    const reveal = answer(live, live.round!.count + 2);
    const results = finishPhase(reveal);
    expect(results.phase).toBe("results");
    expect(step(reveal, results)).toEqual([{ cue: "results", atWallMs: results.phaseStartedAt }]);
    const board = finishPhase(results);
    expect(board.phase).toBe("leaderboard");
    expect(step(results, board)).toEqual([]);
    const idle = finishPhase(board);
    expect(idle.phase).toBe("idle");
    expect(step(board, idle)).toEqual([]);
  });

  it("a correct reveal leads into the next intro with fresh countdown cues", () => {
    const live = until(tier(), "live");
    const reveal = answer(live, live.round!.count);
    const intro = finishPhase(reveal);
    expect(intro.phase).toBe("intro");
    expect(names(step(reveal, intro))).toEqual(["countdown", "countdown", "countdown"]);
  });

  it("with no previous state it still cues the current phase", () => {
    expect(names(cuesFor(null, lobby()))).toEqual(["join"]);
  });
});

describe("cuesFor: no cues without a new phase", () => {
  it("phoneSeen heartbeat during live", () => {
    const live = until(tier(), "live");
    const next = reducer(live, { type: "phoneSeen", clientId: PHONE, now: live.phaseStartedAt + 2500 });
    expect(next).not.toBe(live);
    expect(phaseKey(next)).toBe(phaseKey(live));
    expect(cuesFor(live, next)).toEqual([]);
  });

  it("phoneJoined (rejoin) during live", () => {
    const live = until(tier(), "live");
    const dropped = reducer(live, { type: "phoneLeft", clientId: PHONE, explicit: false, now: live.phaseStartedAt + 1000 });
    const back = reducer(dropped, { type: "phoneJoined", clientId: PHONE, now: live.phaseStartedAt + 2000 });
    expect(back.player?.connected).toBe(true);
    expect(cuesFor(live, dropped)).toEqual([]);
    expect(cuesFor(dropped, back)).toEqual([]);
  });

  it("rankResolved in results", () => {
    const live = until(tier(), "live");
    const results = finishPhase(answer(live, live.round!.count + 1));
    expect(results.phase).toBe("results");
    const ranked = reducer(results, { type: "rankResolved", rank: 3 });
    expect(ranked.rank).toBe(3);
    expect(cuesFor(results, ranked)).toEqual([]);
  });

  it("a tick that does not end the phase", () => {
    const live = until(tier(), "live");
    const next = reducer(live, { type: "tick", now: live.phaseStartedAt + 100 });
    expect(cuesFor(live, next)).toEqual([]);
  });
});

describe("musicFor", () => {
  function at(phase: PhaseName, level = 1): GameState {
    const base = createInitialState(0);
    const targets = targetSequence(7);
    return { ...base, phase, targets, round: makeRound(7, level, targets) };
  }

  it("attract for idle, lobby and instructions", () => {
    for (const phase of ["idle", "lobby", "instructions"] as const) {
      expect(musicFor({ ...createInitialState(0), phase })).toEqual({ kind: "attract" });
    }
  });

  it("results for results and leaderboard", () => {
    expect(musicFor(at("results"))).toEqual({ kind: "results" });
    expect(musicFor(at("leaderboard"))).toEqual({ kind: "results" });
  });

  it.each([
    [1, 0],
    [5, 0],
    [6, 1],
    [10, 1],
    [11, 2],
    [15, 2],
    [16, 3],
    [20, 3],
  ])("level %i plays game intensity %i", (level, intensity) => {
    for (const phase of ["tier", "intro", "reveal"] as const) {
      expect(musicFor(at(phase, level))).toEqual({ kind: "game", intensity, live: false });
    }
    expect(musicFor(at("live", level))).toEqual({ kind: "game", intensity, live: true });
  });

  it("the live flag is set only in the live phase", () => {
    const phases: PhaseName[] = ["idle", "lobby", "instructions", "tier", "intro", "live", "reveal", "results", "leaderboard"];
    for (const phase of phases) {
      const m = musicFor(at(phase, 12));
      expect(m.kind === "game" && m.live).toBe(phase === "live");
    }
  });

  it("follows a real run", () => {
    const t = tier();
    expect(musicFor(t)).toEqual({ kind: "game", intensity: 0, live: false });
    const live = until(t, "live");
    expect(musicFor(live)).toEqual({ kind: "game", intensity: 0, live: true });
    expect(musicFor(answer(live, 0))).toEqual({ kind: "game", intensity: 0, live: false });
  });

  it("musicKey and musicFromKey round-trip", () => {
    for (const key of ["attract", "game0", "game1", "game2", "game3", "game0-live", "game3-live", "results", "silent"]) {
      expect(musicKey(musicFromKey(key)!)).toBe(key);
    }
    expect(musicFromKey("game4")).toBeNull();
  });
});

describe("musicAnchorFor", () => {
  it("puts a bar line on the start of the live window, from the countdown", () => {
    for (const ts of [1, 0.1]) {
      const intro = until(tier(ts), "intro");
      expect(musicAnchorFor(intro)).toBeCloseTo(intro.phaseStartedAt + TIMINGS.introMs * ts, 6);
    }
  });

  it("asks for no alignment elsewhere", () => {
    const t = tier();
    expect(musicAnchorFor(t)).toBeNull();
    expect(musicAnchorFor(until(t, "live"))).toBeNull();
    expect(musicAnchorFor(lobby())).toBeNull();
  });
});

// A minimal recording stand-in for BaseAudioContext: enough of the node graph
// for the music code to run under node, logging every oscillator it starts.
interface Note {
  type: string;
  freq: number;
  start: number;
}

function fakeContext() {
  const notes: Note[] = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
  });
  const node = () => ({
    connect<T>(dest: T): T {
      return dest;
    },
    disconnect() {},
  });
  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param(1) }),
    createBiquadFilter: () => ({ ...node(), type: "lowpass", frequency: param(350), Q: param(1) }),
    createStereoPanner: () => ({ ...node(), pan: param(0) }),
    createBuffer: (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createOscillator: () => {
      const o = {
        ...node(),
        type: "sine",
        frequency: param(440),
        detune: param(0),
        onended: null as unknown,
        start(t: number) {
          notes.push({ type: o.type, freq: o.frequency.value, start: t });
        },
        stop() {},
      };
      return o;
    },
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, onended: null, start() {}, stop() {} }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, dest: node() as unknown as AudioNode, notes };
}

const game = (intensity: 0 | 1 | 2 | 3, live = false): MusicMode => ({ kind: "game", intensity, live });
/** Arp notes: triangles in the D4..D6 pool (the pad's triangles sit an octave below F3). */
const arps = (notes: Note[]) => notes.filter((n) => n.type === "triangle" && n.freq > 290);
const kicks = (notes: Note[]) => notes.filter((n) => n.type === "sine" && n.freq === 140);
const padStarts = (notes: Note[]) => [...new Set(notes.filter((n) => n.type === "sawtooth" && n.freq > 170).map((n) => n.start))];
/** Is t on the original grid (anchor 0)? */
const onGrid = (t: number) => Math.abs(t / STEP - Math.round(t / STEP)) < 1e-6;

describe("music scheduling", () => {
  it("drops the arp while the round is live", () => {
    const off = fakeContext();
    scheduleRange(off.ctx, off.dest, game(3), 0, 4 * BAR);
    expect(arps(off.notes).length).toBeGreaterThan(0);
    const live = fakeContext();
    scheduleRange(live.ctx, live.dest, game(3, true), 0, 4 * BAR);
    expect(arps(live.notes)).toEqual([]);
    expect(kicks(live.notes).length).toBeGreaterThan(0);
  });

  it("applies the live flag on the next step, not the next bar line", () => {
    const { ctx, dest, notes } = fakeContext();
    const st = createStepState(0, game(1));
    scheduleRange(ctx, dest, game(1), 0, 0.5, st);
    expect(arps(notes).length).toBeGreaterThan(0);
    scheduleRange(ctx, dest, game(1, true), 0.5, 2 * BAR, st);
    expect(arps(notes).filter((n) => n.start >= 0.5)).toEqual([]);
  });

  it("waits for the bar line before an intensity change", () => {
    const { ctx, dest, notes } = fakeContext();
    const st = createStepState(0, game(0));
    scheduleRange(ctx, dest, game(0), 0, 1, st);
    scheduleRange(ctx, dest, game(3), 1, 2 * BAR, st);
    const k = kicks(notes).map((n) => n.start);
    expect(k.length).toBeGreaterThan(0);
    expect(Math.min(...k)).toBeCloseTo(BAR, 9);
  });

  it("resyncs a late wake-up to the next step without a burst, applying the bar's mode change", () => {
    const { ctx, dest, notes } = fakeContext();
    const st = createStepState(0, game(0));
    scheduleRange(ctx, dest, game(0), 0, 0.25, st);
    notes.length = 0;
    const now = 5.03; // 2.5 bars later, mid-bar
    catchUp(st, now, game(3));
    expect(st.step).toBe(Math.ceil(now / STEP));
    expect(st.mode).toEqual(game(3));
    scheduleRange(ctx, dest, game(3), now - 0.03, now + 0.25, st);
    expect(notes.length).toBeGreaterThan(0);
    expect(Math.min(...notes.map((n) => n.start))).toBeGreaterThanOrEqual(now - 1e-9);
    expect(Math.max(...notes.map((n) => n.start))).toBeLessThan(now + 0.25);
  });

  it("realigns the bar grid so a bar line falls on the requested time", () => {
    const { ctx, dest, notes } = fakeContext();
    const st = createStepState(0, game(3), 3);
    const at = 3.3;
    alignTo(st, at);
    scheduleRange(ctx, dest, game(3), 0, 6, st);
    const pads = padStarts(notes);
    expect(pads.length).toBe(3);
    [1.3, 3.3, 5.3].forEach((t, k) => expect(pads[k]).toBeCloseTo(t, 9));
    // The shortened bar's old-grid tail is skipped: nothing on the old grid after 1.3.
    expect(notes.filter((n) => n.start > 1.3 + 1e-6 && onGrid(n.start))).toEqual([]);
    expect(kicks(notes).some((n) => Math.abs(n.start - at) < 1e-9)).toBe(true);
  });

  it("leaves an aligned grid alone", () => {
    const st = createStepState(0, game(1), 5);
    alignTo(st, 10);
    expect(st.shift).toBeUndefined();
  });

  it("opens the results bed on D major, the chord of the results sting", () => {
    const { ctx, dest, notes } = fakeContext();
    scheduleRange(ctx, dest, { kind: "results" }, 0, 0.1);
    const midi = (n: Note) => Math.round(12 * Math.log2(n.freq / 440) + 69);
    const pad = notes.filter((n) => n.type === "sawtooth" && n.freq > 170).map(midi);
    expect([...new Set(pad)].sort((a, b) => a - b)).toEqual([54, 57, 61, 64]); // F#3 A3 C#4 E4
    expect(notes.some((n) => n.type === "sine" && midi(n) === 38)).toBe(true); // over D2
  });
});
