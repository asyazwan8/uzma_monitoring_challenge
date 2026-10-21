import { createRng, hashSeed } from "@/lib/rng";
import {
  TARGET_KINDS,
  TOTAL_LEVELS,
  levelConfig,
  startsTier,
  type LevelConfig,
  type TargetKind,
} from "./levels";
import { PHONE_TIMEOUT_MS, cleanNickname, type PhoneView } from "./protocol";
import { roundAccuracy, roundPoints, speedFactor, summarise, type RoundResult } from "./scoring";

/**
 * Pure state machine for the display (the game host). Time only enters through
 * the `now` carried on each action, so every transition is unit-testable.
 *
 * idle -> lobby -> instructions -> [tier] -> intro -> expose -> answer -> reveal
 *      -> ([tier] -> intro ...) | results -> leaderboard -> idle
 */

export type PhaseName =
  | "idle"
  | "lobby"
  | "instructions"
  | "tier"
  | "intro"
  | "expose"
  | "answer"
  | "reveal"
  | "results"
  | "leaderboard";

export const TIMINGS = {
  tierMs: 3200,
  introMs: 3000,
  revealCorrectMs: 4500,
  revealMissMs: 6500,
  /** Phones get the keypad slightly after the display opens the window. */
  answerGraceMs: 1500,
  resultsMs: 16000,
  leaderboardMs: 14000,
  /** A joined phone that never presses START is dropped after this long. */
  lobbyIdleMs: 120000,
};

export interface Player {
  clientId: string;
  nickname: string | null;
  connected: boolean;
  lastSeen: number;
}

export interface Round {
  level: number;
  config: LevelConfig;
  target: TargetKind;
  seed: number;
  /** The true count. The city generator places exactly this many targets. */
  count: number;
}

export interface GameState {
  phase: PhaseName;
  phaseStartedAt: number;
  /** Incremented on every return to idle; the room code rotates with it. */
  session: number;
  roomCode: string;
  player: Player | null;
  runSeed: number;
  targets: TargetKind[];
  round: Round | null;
  history: RoundResult[];
  score: number;
  rank: number | null;
  /** Multiplier on every timer; < 1 speeds the game up for automated tests. */
  timeScale: number;
}

export type GameAction =
  | { type: "phoneJoined"; clientId: string; now: number }
  | { type: "phoneReady"; clientId: string; nickname: string; now: number }
  | { type: "phoneStart"; clientId: string; runSeed: number; now: number }
  | { type: "phoneAnswer"; clientId: string; level: number; value: number; reactionMs: number; now: number }
  | { type: "phoneSeen"; clientId: string; now: number }
  /** explicit: the player tapped quit. Otherwise the transport dropped and may come back. */
  | { type: "phoneLeft"; clientId: string; explicit: boolean; now: number }
  | { type: "rankResolved"; rank: number | null }
  | { type: "tick"; now: number }
  | { type: "reset"; now: number };

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(seed: number): string {
  const rng = createRng(seed);
  let code = "";
  for (let i = 0; i < 5; i++) code += ROOM_ALPHABET[rng.int(0, ROOM_ALPHABET.length - 1)];
  return code;
}

export function createInitialState(now: number, timeScale = 1): GameState {
  return {
    phase: "idle",
    phaseStartedAt: now,
    session: 0,
    roomCode: makeRoomCode(hashSeed(now, 0)),
    player: null,
    runSeed: 0,
    targets: [],
    round: null,
    history: [],
    score: 0,
    rank: null,
    timeScale,
  };
}

/**
 * Target per level: each tier of five covers all four kinds once plus one repeat,
 * and the same kind never appears twice in a row.
 */
export function targetSequence(runSeed: number): TargetKind[] {
  const rng = createRng(hashSeed(runSeed, "targets"));
  const out: TargetKind[] = [];
  for (let tier = 0; tier < TOTAL_LEVELS / 5; tier++) {
    const block = rng.shuffle(TARGET_KINDS);
    if (out.length && block[0] === out[out.length - 1]) [block[0], block[1]] = [block[1], block[0]];
    const extra = rng.pick(TARGET_KINDS.filter((k) => k !== block[3]));
    out.push(...block, extra);
  }
  return out;
}

export function makeRound(runSeed: number, level: number, targets: readonly TargetKind[]): Round {
  const config = levelConfig(level);
  const seed = hashSeed(runSeed, "level", level);
  const rng = createRng(seed);
  return { level, config, target: targets[level - 1], seed, count: rng.int(config.count[0], config.count[1]) };
}

/** How long the current phase lasts before `tick` advances it; null = waits for input. */
export function phaseDurationMs(state: GameState): number | null {
  const s = state.timeScale;
  switch (state.phase) {
    case "tier":
      return TIMINGS.tierMs * s;
    case "intro":
      return TIMINGS.introMs * s;
    case "expose":
      return state.round!.config.exposureMs * s;
    case "answer":
      return state.round!.config.answerWindowMs * s + TIMINGS.answerGraceMs;
    case "reveal":
      return (lastResult(state)?.correct ? TIMINGS.revealCorrectMs : TIMINGS.revealMissMs) * s;
    case "results":
      return TIMINGS.resultsMs * s;
    case "leaderboard":
      return TIMINGS.leaderboardMs * s;
    case "lobby":
    case "instructions":
      return TIMINGS.lobbyIdleMs;
    default:
      return null;
  }
}

export function lastResult(state: GameState): RoundResult | null {
  return state.history.length ? state.history[state.history.length - 1] : null;
}

function enter(state: GameState, phase: PhaseName, now: number, patch: Partial<GameState> = {}): GameState {
  return { ...state, ...patch, phase, phaseStartedAt: now };
}

function backToIdle(state: GameState, now: number): GameState {
  const session = state.session + 1;
  return {
    ...createInitialState(now, state.timeScale),
    session,
    roomCode: makeRoomCode(hashSeed(now, session, state.roomCode)),
  };
}

function isCurrentPlayer(state: GameState, clientId: string): boolean {
  return state.player?.clientId === clientId;
}

function resolveAnswer(state: GameState, value: number | null, reactionMs: number | null, now: number): GameState {
  const round = state.round!;
  const window = round.config.answerWindowMs;
  const clampedReaction = reactionMs === null ? null : Math.max(0, Math.min(window, Math.round(reactionMs)));
  const accuracy = roundAccuracy(value, round.count);
  const points = roundPoints(round.config.basePoints, accuracy, speedFactor(clampedReaction, window));
  const result: RoundResult = {
    level: round.level,
    tier: round.config.tier,
    target: round.target,
    truth: round.count,
    answer: value,
    reactionMs: clampedReaction,
    answerWindowMs: window,
    accuracy,
    points,
    correct: value === round.count,
  };
  return enter(state, "reveal", now, { history: [...state.history, result], score: state.score + points });
}

function advance(state: GameState, now: number): GameState {
  switch (state.phase) {
    case "tier":
      return enter(state, "intro", now);
    case "intro":
      return enter(state, "expose", now);
    case "expose":
      return enter(state, "answer", now);
    case "answer":
      return resolveAnswer(state, null, null, now);
    case "reveal": {
      const result = lastResult(state)!;
      if (!result.correct || result.level >= TOTAL_LEVELS) return enter(state, "results", now);
      const level = result.level + 1;
      const round = makeRound(state.runSeed, level, state.targets);
      return enter(state, startsTier(level) ? "tier" : "intro", now, { round });
    }
    case "results":
      return enter(state, "leaderboard", now);
    case "leaderboard":
    case "lobby":
    case "instructions":
      return backToIdle(state, now);
    default:
      return state;
  }
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "phoneJoined": {
      if (state.player) {
        if (!isCurrentPlayer(state, action.clientId)) return state;
        return { ...state, player: { ...state.player, connected: true, lastSeen: action.now } };
      }
      if (state.phase !== "idle") return state;
      return enter(state, "lobby", action.now, {
        player: { clientId: action.clientId, nickname: null, connected: true, lastSeen: action.now },
      });
    }
    case "phoneReady": {
      if (!isCurrentPlayer(state, action.clientId)) return state;
      if (state.phase !== "lobby" && state.phase !== "instructions") return state;
      const nickname = cleanNickname(action.nickname);
      if (!nickname) return state;
      return enter(state, "instructions", action.now, {
        player: { ...state.player!, nickname, lastSeen: action.now, connected: true },
      });
    }
    case "phoneStart": {
      if (!isCurrentPlayer(state, action.clientId) || state.phase !== "instructions") return state;
      const targets = targetSequence(action.runSeed);
      return enter(state, "tier", action.now, {
        runSeed: action.runSeed,
        targets,
        round: makeRound(action.runSeed, 1, targets),
        history: [],
        score: 0,
        rank: null,
      });
    }
    case "phoneAnswer": {
      if (!isCurrentPlayer(state, action.clientId) || state.phase !== "answer") return state;
      if (action.level !== state.round?.level) return state;
      if (!Number.isFinite(action.value) || action.value < 0) return state;
      return resolveAnswer(state, Math.floor(action.value), action.reactionMs, action.now);
    }
    case "phoneSeen": {
      if (!isCurrentPlayer(state, action.clientId)) return state;
      return { ...state, player: { ...state.player!, connected: true, lastSeen: action.now } };
    }
    case "phoneLeft": {
      if (!isCurrentPlayer(state, action.clientId)) return state;
      if (action.explicit && (state.phase === "lobby" || state.phase === "instructions")) {
        return backToIdle(state, action.now);
      }
      // Otherwise wait: the heartbeat timeout clears a lobby, and mid-game an
      // unanswered round times out and ends the run.
      return { ...state, player: { ...state.player!, connected: false } };
    }
    case "rankResolved":
      return { ...state, rank: action.rank };
    case "tick": {
      if (
        (state.phase === "lobby" || state.phase === "instructions") &&
        state.player &&
        action.now - state.player.lastSeen > PHONE_TIMEOUT_MS
      ) {
        return backToIdle(state, action.now);
      }
      const duration = phaseDurationMs(state);
      if (duration === null || action.now - state.phaseStartedAt < duration) return state;
      return advance(state, action.now);
    }
    case "reset":
      return backToIdle(state, action.now);
  }
}

/** What the connected phone should show for the current state. */
export function phoneViewFor(state: GameState): PhoneView {
  const round = state.round;
  switch (state.phase) {
    case "idle":
    case "lobby":
      return { screen: "nickname" };
    case "instructions":
      return { screen: "instructions", nickname: state.player?.nickname ?? "" };
    case "tier":
    case "intro":
    case "expose":
      return { screen: "watch", level: round!.level, tier: round!.config.tier, target: round!.target, stage: state.phase };
    case "answer":
      return {
        screen: "answer",
        level: round!.level,
        tier: round!.config.tier,
        target: round!.target,
        windowMs: round!.config.answerWindowMs * state.timeScale,
      };
    case "reveal": {
      const result = lastResult(state)!;
      return {
        screen: "reveal",
        level: result.level,
        target: result.target,
        correct: result.correct,
        truth: result.truth,
        answer: result.answer,
        points: result.points,
        score: state.score,
        gameOver: !result.correct || result.level >= TOTAL_LEVELS,
      };
    }
    case "results":
    case "leaderboard": {
      const summary = summarise(state.history, TOTAL_LEVELS);
      return {
        screen: "results",
        score: summary.score,
        levelsCleared: summary.levelsCleared,
        accuracyPct: summary.accuracyPct,
        avgReactionMs: summary.avgReactionMs,
        rank: state.rank,
      };
    }
  }
}
