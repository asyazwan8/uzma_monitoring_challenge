"use client";

import { useMemo } from "react";
import { CityMap, DetectionLayer } from "@/city/CityMap";
import { generateCity } from "@/city/generate";
import { Wordmark } from "@/components/brand/Wordmark";
import { TargetIcon } from "@/components/brand/TargetIcon";
import { TierBadge } from "@/components/brand/TierBadge";
import { TIMINGS, isRunOver, lastResult, liveWindowMs, type GameState } from "@/game/engine";
import {
  LEVELS,
  LIVES,
  ROUND_MS,
  TARGET_HINTS,
  TARGET_LABELS,
  TIERS,
  TOTAL_LEVELS,
  gridLabel,
  revealStaggerMs,
  revealVerdictDelayMs,
  tierInfo,
} from "@/game/levels";
import { AI_BENCHMARK, livePoints } from "@/game/scoring";
import { formatScore, pad2, tileDate } from "@/lib/format";
import { useNow } from "@/lib/useNow";

const MAP = { x: 48, y: 112, w: 1440, h: 810 };
/** A phone silent for longer than this is shown as disconnected. */
const PHONE_STALE_MS = 7000;
/** The scan line plays over the intro card just before the tile appears, never over the tile. */
const SCAN_MS = 600;

/** Corner brackets drawn just outside the tile so they never cover any of it. */
function Brackets({ urgent }: { urgent: boolean }) {
  const arm = 34;
  const c = `absolute ${urgent ? "border-geo-orange" : "border-white/70"}`;
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: MAP.x - 12, top: MAP.y - 12, width: MAP.w + 24, height: MAP.h + 24 }}
      aria-hidden
    >
      <span className={`${c} left-0 top-0 border-l-2 border-t-2`} style={{ width: arm, height: arm }} />
      <span className={`${c} right-0 top-0 border-r-2 border-t-2`} style={{ width: arm, height: arm }} />
      <span className={`${c} bottom-0 left-0 border-b-2 border-l-2`} style={{ width: arm, height: arm }} />
      <span className={`${c} bottom-0 right-0 border-b-2 border-r-2`} style={{ width: arm, height: arm }} />
    </div>
  );
}

function LevelTimeline({ level, history }: { level: number; history: GameState["history"] }) {
  return (
    <div className="grid grid-cols-4 gap-6">
      {TIERS.map((t) => (
        <div key={t.id}>
          <p className={`mb-2 text-[13px] font-extrabold uppercase tracking-[0.14em] ${level >= t.levels[0] ? "text-white" : "text-white/35"}`}>
            {pad2(t.index + 1)} {t.label} <span className="text-white/45">· {gridLabel(t.id)}</span>
          </p>
          <div className="grid grid-cols-5 gap-[6px]">
            {Array.from({ length: 5 }, (_, i) => {
              const l = t.levels[0] + i;
              const done = history.find((r) => r.level === l);
              const cls = done
                ? done.correct
                  ? "bg-white"
                  : "bg-white/30 outline outline-2 outline-geo-orange"
                : l === level
                  ? "bg-geo-orange"
                  : "bg-white/12";
              return <span key={l} className={`h-[10px] rounded-[2px] ${cls}`} data-level={l} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Disconnected() {
  return (
    <p className="pulse-soft mt-5 text-[22px] font-bold leading-snug text-geo-orange" data-testid="phone-disconnected">
      Phone disconnected: reconnecting…
    </p>
  );
}

export function GameScreen({ state, debug }: { state: GameState; debug: boolean }) {
  const now = useNow(100);
  const round = state.round!;
  const { config, target } = round;
  const info = tierInfo(config.tier);
  const label = TARGET_LABELS[target];
  const grid = gridLabel(config.tier);
  const scene = useMemo(
    () => generateCity({ seed: round.seed, level: round.level, target: round.target, count: round.count }),
    [round.seed, round.level, round.target, round.count],
  );
  const elapsed = Math.max(0, now - state.phaseStartedAt);
  const ts = state.timeScale;
  const result = state.phase === "reveal" ? lastResult(state) : null;
  const tierFirst = LEVELS[info.levels[0] - 1];
  const tierLast = LEVELS[info.levels[1] - 1];
  const phoneOnline = !!state.player?.connected && now - state.player.lastSeen < PHONE_STALE_MS;

  // The live round: all timer visuals follow the 15 s window, not the phase
  // length, which adds a short grace period for answers still in flight.
  const live = state.phase === "live";
  const windowMs = liveWindowMs(state);
  const windowLeft = Math.max(0, windowMs - elapsed);
  const secondsLeft = Math.ceil(windowLeft / 1000);
  const timeUp = live && windowLeft === 0;
  const urgent = live && !timeUp && windowLeft <= 3000 * ts;
  const pointsIfExact = livePoints(config.basePoints, elapsed / ts);

  const showMap = live || state.phase === "reveal";
  const introLeft = TIMINGS.introMs * ts - elapsed;
  const introCount = Math.max(1, Math.ceil(introLeft / (1000 * ts)));
  const verdictShown = state.phase === "reveal" && elapsed >= revealVerdictDelayMs(round.count);
  // Keep the lost life on screen until the verdict lands.
  const livesShown = state.lives + (state.phase === "reveal" && !verdictShown && result && !result.correct ? 1 : 0);
  const runOver = state.phase === "reveal" && isRunOver(state);

  return (
    <div className="absolute inset-0 bg-geo-space" data-testid="screen-game" data-phase={state.phase} data-level={round.level}>
      {/* Header */}
      <header className="absolute left-[48px] right-[48px] top-[30px] flex items-center justify-between">
        <Wordmark size={22} subline={false} />
        <p className="geo-h text-[18px] tracking-[0.18em] text-white/80">
          The Monitoring <span className="text-geo-orange">Challenge</span>
        </p>
        <p className="geo-caption flex items-center gap-3 text-[15px] text-white/80">
          <span className={`inline-block h-[9px] w-[9px] rounded-full ${phoneOnline ? "bg-white" : "pulse-soft bg-geo-orange"}`} />
          Operator <span className="text-white">{state.player?.nickname}</span>
        </p>
      </header>

      {/* Map frame. During the live round nothing is drawn over the tile. */}
      <div className="absolute overflow-hidden rounded-[6px] bg-[#0d2233]" style={{ left: MAP.x, top: MAP.y, width: MAP.w, height: MAP.h }}>
        <div
          className={`absolute inset-0 transition-opacity duration-150 ${showMap ? (timeUp ? "opacity-55" : "opacity-100") : "opacity-0"}`}
          style={{ willChange: "opacity" }}
          data-testid="city-map"
        >
          <CityMap scene={scene} vignette={0.15} className="absolute inset-0 h-full w-full" />
          {state.phase === "reveal" && (
            <DetectionLayer
              key={round.level}
              scene={scene}
              staggerMs={revealStaggerMs(round.count)}
              renderWidthPx={MAP.w}
              className="absolute inset-0 h-full w-full"
            />
          )}
        </div>

        {state.phase === "tier" && (
          <div className="rise-in absolute inset-0 flex flex-col items-center justify-center bg-geo-space text-center" data-testid="tier-banner">
            <p className="geo-kicker text-[24px]">
              Tier {pad2(info.index + 1)} · Levels {info.levels[0]}–{info.levels[1]}
            </p>
            <p className="geo-hero mt-4 text-[150px]">{info.label}</p>
            <p className="mt-4 text-[30px] text-white/80">{info.blurb}</p>
            <div className="tabular mt-10 flex gap-12 text-[22px] text-white/70">
              <span>
                <b className="text-white">{grid}</b> city blocks
              </span>
              <span>
                <b className="text-white">
                  {tierFirst.count[0]}–{tierLast.count[1]}
                </b>{" "}
                objects
              </span>
              <span>
                <b className="text-white">{ROUND_MS / 1000} s</b> per level
              </span>
              <span>
                <b className="text-white">{config.basePoints}</b> pts
              </span>
            </div>
          </div>
        )}

        {state.phase === "intro" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-geo-space text-center" data-testid="intro">
            <p className="geo-kicker text-[22px]">
              Level {pad2(round.level)} · {info.label} · {grid} blocks
            </p>
            <p className="geo-h mt-6 text-[34px] text-white/80">Count the</p>
            <div className="mt-4 flex items-center gap-8">
              <TargetIcon kind={target} size={132} className="rounded-[8px] ring-2 ring-white/20" />
              <p className="geo-hero text-[92px]">{label.plural}</p>
            </div>
            <p className="mt-6 text-[22px] text-white/60">{TARGET_HINTS[target]}</p>
            <p key={introCount} className="count-pop tabular mt-10 text-[120px] font-extrabold leading-none text-geo-orange">
              {introCount}
            </p>
            {introLeft <= SCAN_MS * ts && <div className="scan-line" style={{ animationDuration: `${SCAN_MS * ts}ms` }} />}
          </div>
        )}
      </div>
      <Brackets urgent={urgent} />

      {/* 15 s drain bar just under the tile, visible in peripheral vision. */}
      <div className="absolute h-[10px] overflow-hidden rounded-full bg-white/12" style={{ left: MAP.x, top: MAP.y + MAP.h + 16, width: MAP.w }}>
        {live && (
          <div
            key={state.phaseStartedAt}
            className={`drain h-full w-full ${urgent || timeUp ? "bg-geo-orange" : "bg-white"}`}
            style={{ animationDuration: `${windowMs}ms` }}
            data-testid="live-bar"
          />
        )}
      </div>

      {/* Caption under the tile; on reveal the AI result takes its place. */}
      {state.phase === "reveal" ? (
        <div className="rise-in absolute flex items-baseline gap-5" style={{ left: MAP.x, top: MAP.y + MAP.h + 34, width: MAP.w }} data-testid="ai-detected">
          <span className="geo-kicker text-[16px]">Geospatial AI detected</span>
          <span className="geo-h text-[30px] leading-none">
            <span className="tabular">{round.count}</span> {label.plural}
          </span>
          <span className="geo-caption text-[15px] text-white/70">in {AI_BENCHMARK.reactionLabel} · 100% accuracy</span>
        </div>
      ) : (
        <div className="geo-caption absolute flex items-center justify-between text-[13px] text-white/55" style={{ left: MAP.x, top: MAP.y + MAP.h + 42, width: MAP.w }}>
          <span className="flex items-center gap-3">
            {live && (
              <>
                <span className="pulse-soft inline-block h-[9px] w-[9px] rounded-full bg-geo-orange" />
                <span className="text-white">Live</span>
                <span>·</span>
              </>
            )}
            UZMASAT-1 · Optical · {scene.caption.gsdM.toFixed(2)} m GSD · {tileDate()} · Tile {scene.caption.tile}
          </span>
          <span className="flex items-center gap-3">
            <span className="relative h-[8px] w-[120px] border-x-2 border-b-2 border-white/60" />
            {Math.round(120 * scene.caption.gsdM * (1440 / MAP.w))} m
          </span>
        </div>
      )}

      {/* Level timeline */}
      <div className="absolute" style={{ left: MAP.x, top: 1004, width: MAP.w }}>
        <LevelTimeline level={round.level} history={state.history} />
      </div>

      {/* HUD */}
      <aside className="absolute flex flex-col" style={{ left: MAP.x + MAP.w + 48, top: MAP.y, width: 336, height: 928 }}>
        <div className="border-b border-white/15 pb-5">
          <p className="geo-kicker text-[14px]">Level</p>
          <p className="tabular mt-1 flex items-baseline gap-2 font-extrabold leading-none">
            <span className="text-[72px]" data-testid="hud-level">
              {pad2(round.level)}
            </span>
            <span className="text-[26px] text-white/45">/ {TOTAL_LEVELS}</span>
          </p>
          <div className="mt-3 flex items-center gap-3">
            <TierBadge tier={config.tier} />
            <span className="geo-caption text-[13px] text-white/60">{grid} blocks</span>
          </div>
          <div className="mt-4 flex items-center gap-3" data-testid="hud-lives" data-lives={livesShown}>
            <span className="geo-caption text-[12px] text-white/60">Lives</span>
            {Array.from({ length: LIVES }, (_, i) => (
              <span
                key={i}
                className={`h-[16px] w-[16px] rounded-full ${i < livesShown ? "bg-white" : "border-2 border-white/30"}`}
              />
            ))}
          </div>
        </div>

        <div className="border-b border-white/15 py-5">
          <p className="geo-kicker text-[14px]">Count the</p>
          <div className="mt-3 flex items-center gap-4">
            <TargetIcon kind={target} size={72} className="shrink-0 rounded-[6px] ring-1 ring-white/20" />
            <p className="geo-h text-[30px] leading-[1.05]">{label.plural}</p>
          </div>
          <p className="mt-3 text-[15px] leading-[1.45] text-white/60">{TARGET_HINTS[target]}</p>
        </div>

        <div className="flex-1 border-b border-white/15 py-5">
          {(state.phase === "tier" || state.phase === "intro") && (
            <>
              <p className="geo-kicker text-[14px]">Stand by</p>
              <p className="mt-2 text-[22px] text-white/80">Satellite tile incoming.</p>
              <p className="tabular mt-4 text-[17px] text-white/60">
                {ROUND_MS / 1000} s to count and answer · {config.basePoints} pts
              </p>
              {!phoneOnline && <Disconnected />}
            </>
          )}
          {live && !timeUp && (
            <div data-testid="hud-live">
              <p className="geo-kicker text-[14px]">Answer on your phone</p>
              <p className={`tabular text-[150px] font-extrabold leading-[0.95] ${urgent ? "text-geo-orange" : ""}`} data-testid="hud-seconds">
                {secondsLeft}
              </p>
              <p className="geo-caption mt-3 text-[12px] text-white/60">Points if exact</p>
              <p className="tabular text-[44px] font-extrabold leading-none">{pointsIfExact}</p>
              <p className="mt-2 text-[15px] text-white/55">Faster answers score more.</p>
              {!phoneOnline && <Disconnected />}
            </div>
          )}
          {timeUp && (
            <div data-testid="hud-time-up">
              <p className="geo-kicker text-[14px]">Time&apos;s up</p>
              <p className="geo-h mt-2 text-[44px] leading-tight">Locking answers…</p>
            </div>
          )}
          {state.phase === "reveal" && result && (
            <div data-testid="reveal-result" data-correct={result.correct}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="geo-caption text-[12px] text-white/60">Your answer</p>
                  <p className="tabular text-[64px] font-extrabold leading-none">{result.answer ?? "—"}</p>
                </div>
                <div>
                  <p className="geo-caption text-[12px] text-white/60">True count</p>
                  <p className="tabular text-[64px] font-extrabold leading-none text-white/80">{verdictShown ? result.truth : "…"}</p>
                </div>
              </div>
              {verdictShown ? (
                <div className="rise-in">
                  <p className={`geo-h mt-5 text-[30px] ${result.correct ? "text-white" : "text-geo-orange"}`}>
                    {result.correct ? "Correct" : result.answer === null ? "Time's up" : "Missed"}
                    <span className="tabular ml-3 text-white/80">+{result.points}</span>
                  </p>
                  <p className="tabular mt-2 text-[16px] text-white/60">
                    {result.correct
                      ? `${Math.round(config.basePoints / 2)} exact + ${result.points - Math.round(config.basePoints / 2)} speed bonus · ${((result.reactionMs ?? 0) / 1000).toFixed(2)} s`
                      : `${result.answer === null ? "No answer in time" : `Accuracy ${(result.accuracy * 100).toFixed(0)}% this round`} · ${
                          state.lives === 0 ? "no lives left" : `${state.lives} ${state.lives === 1 ? "life" : "lives"} left`
                        }`}
                  </p>
                  <p className="mt-1 text-[16px] text-white/60">
                    {runOver ? (state.lives === 0 ? "Run complete." : "All 20 levels played.") : "Next level loading."}
                  </p>
                </div>
              ) : (
                <p className="geo-caption pulse-soft mt-5 text-[15px] text-white/70">AI scanning the tile…</p>
              )}
            </div>
          )}
        </div>

        <div className="pt-5">
          <p className="geo-kicker text-[14px]">Score</p>
          <p className="tabular text-[56px] font-extrabold leading-none" data-testid="hud-score">
            {formatScore(state.score)}
          </p>
        </div>
      </aside>

      {debug && (
        <div className="absolute bottom-2 right-2 rounded bg-black/80 px-3 py-1 font-mono text-[12px] text-white/80" data-testid="debug">
          truth={round.count} phase={state.phase} seed={round.seed}
        </div>
      )}
    </div>
  );
}
