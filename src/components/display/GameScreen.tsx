"use client";

import { useMemo } from "react";
import { CityMap, DetectionLayer } from "@/city/CityMap";
import { generateCity } from "@/city/generate";
import { Wordmark } from "@/components/brand/Wordmark";
import { TargetIcon } from "@/components/brand/TargetIcon";
import { TierBadge } from "@/components/brand/TierBadge";
import { lastResult, phaseDurationMs, type GameState } from "@/game/engine";
import { LEVELS, TARGET_HINTS, TARGET_LABELS, TIERS, TOTAL_LEVELS, tierInfo } from "@/game/levels";
import { AI_BENCHMARK } from "@/game/scoring";
import { formatScore, pad2, tileDate } from "@/lib/format";
import { useNow } from "@/lib/useNow";

const MAP = { x: 48, y: 112, w: 1440, h: 810 };

function Brackets() {
  const arm = 34;
  const c = "absolute border-white/80";
  return (
    <div className="pointer-events-none absolute inset-[14px]" aria-hidden>
      <span className={`${c} left-0 top-0 border-l-2 border-t-2`} style={{ width: arm, height: arm }} />
      <span className={`${c} right-0 top-0 border-r-2 border-t-2`} style={{ width: arm, height: arm }} />
      <span className={`${c} bottom-0 left-0 border-b-2 border-l-2`} style={{ width: arm, height: arm }} />
      <span className={`${c} bottom-0 right-0 border-b-2 border-r-2`} style={{ width: arm, height: arm }} />
    </div>
  );
}

function DrainBar({ durationMs, startKey, tone = "orange" }: { durationMs: number; startKey: string | number; tone?: "orange" | "white" }) {
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/15">
      <div
        key={startKey}
        className={`drain h-full w-full ${tone === "orange" ? "bg-geo-orange" : "bg-white"}`}
        style={{ animationDuration: `${durationMs}ms` }}
      />
    </div>
  );
}

function LevelTimeline({ level, history }: { level: number; history: GameState["history"] }) {
  return (
    <div className="grid grid-cols-4 gap-6">
      {TIERS.map((t) => (
        <div key={t.id}>
          <p className={`mb-2 text-[13px] font-extrabold uppercase tracking-[0.14em] ${level >= t.levels[0] ? "text-white" : "text-white/35"}`}>
            {pad2(t.index + 1)} {t.label}
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

export function GameScreen({ state, debug }: { state: GameState; debug: boolean }) {
  const now = useNow(100);
  const round = state.round!;
  const { config, target } = round;
  const info = tierInfo(config.tier);
  const label = TARGET_LABELS[target];
  const scene = useMemo(
    () => generateCity({ seed: round.seed, level: round.level, target: round.target, count: round.count }),
    [round.seed, round.level, round.target, round.count],
  );
  const duration = phaseDurationMs(state) ?? 0;
  const elapsed = now - state.phaseStartedAt;
  const scaled = (ms: number) => ms * state.timeScale;
  const result = state.phase === "reveal" ? lastResult(state) : null;
  const showMap = state.phase === "expose" || state.phase === "reveal";
  const answerWindow = scaled(config.answerWindowMs);
  const secondsLeft = (ms: number) => Math.max(0, Math.ceil((ms - elapsed) / 1000));
  const stagger = Math.min(120, 1800 / Math.max(1, scene.detections.length));
  const tierFirst = LEVELS[info.levels[0] - 1];
  const tierLast = LEVELS[info.levels[1] - 1];

  return (
    <div className="absolute inset-0 bg-geo-space" data-testid="screen-game" data-phase={state.phase} data-level={round.level}>
      {/* Header */}
      <header className="absolute left-[48px] right-[48px] top-[30px] flex items-center justify-between">
        <Wordmark size={22} subline={false} />
        <p className="geo-h text-[18px] tracking-[0.18em] text-white/80">
          The Monitoring <span className="text-geo-orange">Challenge</span>
        </p>
        <p className="geo-caption flex items-center gap-3 text-[15px] text-white/80">
          <span className={`inline-block h-[9px] w-[9px] rounded-full ${state.player?.connected ? "bg-white" : "pulse-soft bg-geo-orange"}`} />
          Operator <span className="text-white">{state.player?.nickname}</span>
        </p>
      </header>

      {/* Map frame */}
      <div className="absolute overflow-hidden rounded-[6px] bg-[#0d2233]" style={{ left: MAP.x, top: MAP.y, width: MAP.w, height: MAP.h }}>
        <div className={`absolute inset-0 transition-opacity duration-150 ${showMap ? "opacity-100" : "opacity-0"}`} data-testid="city-map">
          <CityMap scene={scene} className="absolute inset-0 h-full w-full" />
          {state.phase === "reveal" && (
            <DetectionLayer key={round.level} scene={scene} staggerMs={stagger} renderWidthPx={MAP.w} className="absolute inset-0 h-full w-full" />
          )}
        </div>
        {state.phase === "expose" && <div key={state.phaseStartedAt} className="scan-sweep" />}

        {state.phase === "expose" && (
          <div className="absolute left-[28px] top-[28px] flex items-center gap-3 rounded-[4px] bg-geo-space/85 px-4 py-2">
            <span className="pulse-soft h-[9px] w-[9px] rounded-full bg-geo-orange" />
            <span className="geo-caption text-[14px]">Live tile · Count the {label.plural}</span>
          </div>
        )}

        {state.phase === "tier" && (
          <div className="rise-in absolute inset-0 flex flex-col items-center justify-center bg-geo-space text-center" data-testid="tier-banner">
            <p className="geo-kicker text-[24px]">
              Tier {pad2(info.index + 1)} · Levels {info.levels[0]}–{info.levels[1]}
            </p>
            <p className="geo-hero mt-4 text-[150px]">{info.label}</p>
            <p className="mt-4 text-[30px] text-white/80">{info.blurb}</p>
            <div className="tabular mt-10 flex gap-12 text-[22px] text-white/70">
              <span>
                <b className="text-white">
                  {tierFirst.count[0]}–{tierLast.count[1]}
                </b>{" "}
                objects
              </span>
              <span>
                <b className="text-white">
                  {(tierFirst.exposureMs / 1000).toFixed(1)}–{(tierLast.exposureMs / 1000).toFixed(1)} s
                </b>{" "}
                on screen
              </span>
              <span>
                <b className="text-white">{config.basePoints}</b> pts per level
              </span>
            </div>
          </div>
        )}

        {state.phase === "intro" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-geo-space text-center" data-testid="intro">
            <p className="geo-kicker text-[22px]">
              Level {pad2(round.level)} · {info.label}
            </p>
            <p className="geo-h mt-6 text-[34px] text-white/80">Count the</p>
            <div className="mt-4 flex items-center gap-8">
              <TargetIcon kind={target} size={132} className="rounded-[8px] ring-2 ring-white/20" />
              <p className="geo-hero text-[92px]">{label.plural}</p>
            </div>
            <p className="mt-6 text-[22px] text-white/60">{TARGET_HINTS[target]}</p>
            <p key={secondsLeft(duration)} className="count-pop tabular mt-10 text-[120px] font-extrabold leading-none text-geo-orange">
              {Math.max(1, secondsLeft(duration))}
            </p>
          </div>
        )}

        {state.phase === "answer" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-geo-space text-center" data-testid="answer-prompt">
            <p className="geo-kicker text-[22px]">Tile closed</p>
            <p className="geo-hero mt-5 text-[80px]">
              How many <span className="text-geo-orange">{label.plural}</span>?
            </p>
            <p className="mt-6 text-[28px] text-white/75">Enter your count on your phone.</p>
            <p className="tabular mt-10 text-[140px] font-extrabold leading-none">{secondsLeft(answerWindow)}</p>
            {!state.player?.connected && <p className="pulse-soft mt-6 text-[22px] font-bold text-geo-orange">Phone disconnected: reconnecting…</p>}
          </div>
        )}

        <Brackets />
      </div>

      {/* Caption + scale bar under the map; on reveal the AI result takes its place. */}
      {state.phase === "reveal" ? (
        <div className="rise-in absolute flex items-baseline gap-5" style={{ left: MAP.x, top: MAP.y + MAP.h + 10, width: MAP.w }} data-testid="ai-detected">
          <span className="geo-kicker text-[16px]">Geospatial AI detected</span>
          <span className="geo-h text-[30px] leading-none">
            <span className="tabular">{round.count}</span> {label.plural}
          </span>
          <span className="geo-caption text-[15px] text-white/70">in {AI_BENCHMARK.reactionLabel} · 100% accuracy</span>
        </div>
      ) : (
        <div className="geo-caption absolute flex items-center justify-between text-[13px] text-white/55" style={{ left: MAP.x, top: MAP.y + MAP.h + 14, width: MAP.w }}>
          <span>
            UZMASAT-1 · Optical · {scene.caption.gsdM.toFixed(2)} m GSD · {tileDate()} · Tile {scene.caption.tile} · {scene.caption.lat} {scene.caption.lon}
          </span>
          <span className="flex items-center gap-3">
            <span className="relative h-[8px] w-[120px] border-x-2 border-b-2 border-white/60" />
            {Math.round(120 * scene.caption.gsdM * (1440 / MAP.w))} m
          </span>
        </div>
      )}

      {/* Level timeline */}
      <div className="absolute" style={{ left: MAP.x, top: 990, width: MAP.w }}>
        <LevelTimeline level={round.level} history={state.history} />
      </div>

      {/* HUD */}
      <aside className="absolute flex flex-col" style={{ left: MAP.x + MAP.w + 48, top: MAP.y, width: 336, height: 928 }}>
        <div className="border-b border-white/15 pb-6">
          <p className="geo-kicker text-[14px]">Level</p>
          <p className="tabular mt-1 flex items-baseline gap-2 font-extrabold leading-none">
            <span className="text-[104px]" data-testid="hud-level">{pad2(round.level)}</span>
            <span className="text-[30px] text-white/45">/ {TOTAL_LEVELS}</span>
          </p>
          <div className="mt-4">
            <TierBadge tier={config.tier} />
          </div>
        </div>

        <div className="border-b border-white/15 py-6">
          <p className="geo-kicker text-[14px]">Count the</p>
          <div className="mt-3 flex items-center gap-4">
            <TargetIcon kind={target} size={72} className="shrink-0 rounded-[6px] ring-1 ring-white/20" />
            <p className="geo-h text-[30px] leading-[1.05]">{label.plural}</p>
          </div>
          <p className="mt-3 text-[15px] leading-[1.45] text-white/60">{TARGET_HINTS[target]}</p>
        </div>

        <div className="flex-1 border-b border-white/15 py-6">
          {(state.phase === "tier" || state.phase === "intro") && (
            <>
              <p className="geo-kicker text-[14px]">Stand by</p>
              <p className="mt-2 text-[22px] text-white/80">Satellite tile incoming.</p>
              <p className="tabular mt-4 text-[17px] text-white/60">
                Viewing time {(config.exposureMs / 1000).toFixed(2)} s · {config.basePoints} pts
              </p>
            </>
          )}
          {state.phase === "expose" && (
            <>
              <p className="geo-kicker text-[14px]">Tile exposure</p>
              <p className="tabular mt-1 text-[64px] font-extrabold leading-none">{(Math.max(0, duration - elapsed) / 1000).toFixed(1)}s</p>
              <div className="mt-5">
                <DrainBar durationMs={duration} startKey={state.phaseStartedAt} />
              </div>
            </>
          )}
          {state.phase === "answer" && (
            <>
              <p className="geo-kicker text-[14px]">Answer on your phone</p>
              <p className="tabular mt-1 text-[64px] font-extrabold leading-none">{secondsLeft(answerWindow)}s</p>
              <div className="mt-5">
                <DrainBar durationMs={answerWindow} startKey={state.phaseStartedAt} tone="white" />
              </div>
              <p className="mt-4 text-[16px] text-white/55">Faster answers score more.</p>
            </>
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
                  <p className="tabular text-[64px] font-extrabold leading-none text-white/80">{result.truth}</p>
                </div>
              </div>
              <p className={`geo-h mt-5 text-[30px] ${result.correct ? "text-white" : "text-geo-orange"}`}>
                {result.correct ? "Correct" : result.answer === null ? "Time's up" : "Missed"}
                <span className="tabular ml-3 text-white/80">+{result.points}</span>
              </p>
              <p className="mt-2 text-[16px] text-white/60">
                {result.correct
                  ? round.level < TOTAL_LEVELS
                    ? "Next level loading."
                    : "All 20 levels cleared."
                  : `Accuracy ${(result.accuracy * 100).toFixed(0)}% this round. Run complete.`}
              </p>
            </div>
          )}
        </div>

        <div className="pt-6">
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
