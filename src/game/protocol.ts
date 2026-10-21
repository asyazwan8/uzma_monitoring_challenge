import type { TargetKind, Tier } from "./levels";

/**
 * Messages between the phone controller and the display. The display is the
 * authoritative host: phones only send intents and render the view they are told to.
 */

export type PhoneToDisplay =
  | { type: "join"; clientId: string }
  | { type: "ready"; clientId: string; nickname: string }
  | { type: "start"; clientId: string }
  | { type: "answer"; clientId: string; level: number; value: number; reactionMs: number }
  | { type: "ping"; clientId: string }
  | { type: "leave"; clientId: string };

/** What the phone should currently render. */
export type PhoneView =
  | { screen: "nickname" }
  | { screen: "instructions"; nickname: string }
  | { screen: "watch"; level: number; tier: Tier; target: TargetKind; stage: "tier" | "intro" | "expose" }
  | { screen: "answer"; level: number; tier: Tier; target: TargetKind; windowMs: number }
  | {
      screen: "reveal";
      level: number;
      target: TargetKind;
      correct: boolean;
      truth: number;
      answer: number | null;
      points: number;
      score: number;
      gameOver: boolean;
    }
  | {
      screen: "results";
      score: number;
      levelsCleared: number;
      accuracyPct: number;
      avgReactionMs: number | null;
      rank: number | null;
    }
  | { screen: "ended" };

export type DisplayToPhone =
  | { type: "welcome"; to: string; accepted: true }
  | { type: "welcome"; to: string; accepted: false; reason: "busy" }
  | { type: "view"; to: string; view: PhoneView };

export type GameMessage = PhoneToDisplay | DisplayToPhone;

export const PHONE_TYPES: ReadonlySet<string> = new Set(["join", "ready", "start", "answer", "ping", "leave"]);

export function isPhoneMessage(msg: GameMessage): msg is PhoneToDisplay {
  return PHONE_TYPES.has(msg.type);
}

export const NICKNAME_MAX = 16;

export function cleanNickname(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX);
}

export const HEARTBEAT_MS = 2500;
/** Display drops a silent phone after this long. */
export const PHONE_TIMEOUT_MS = 20000;
