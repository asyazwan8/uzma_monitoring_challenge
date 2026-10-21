"use client";

import { TargetIcon } from "@/components/brand/TargetIcon";
import { TierBadge } from "@/components/brand/TierBadge";
import { TARGET_HINTS, TARGET_LABELS, TOTAL_LEVELS, tierInfo } from "@/game/levels";
import type { PhoneView } from "@/game/protocol";
import { AI_BENCHMARK, formatSeconds } from "@/game/scoring";
import { formatPct, formatScore, pad2 } from "@/lib/format";

type ViewOf<S extends PhoneView["screen"]> = Extract<PhoneView, { screen: S }>;

export function StartView({ nickname, onStart }: { nickname: string; onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <p className="geo-kicker text-[13px]">Welcome, {nickname}</p>
      <h1 className="geo-h mt-2 text-[30px] leading-tight">
        Ready to <span className="text-geo-orange">monitor</span>?
      </h1>
      <ol className="mt-6 space-y-4">
        {[
          ["Watch", "A city tile flashes on the big screen."],
          ["Count", "Count only the target you are given."],
          ["Answer", "Type the number here. Fast and exact wins."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="tabular flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-geo-orange text-[13px] font-extrabold">
              {pad2(i + 1)}
            </span>
            <span>
              <span className="block text-[16px] font-extrabold uppercase tracking-[0.04em]">{t}</span>
              <span className="block text-[15px] text-white/70">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 rounded-[4px] border border-white/15 px-4 py-3 text-[14px] text-white/70">
        20 levels: Easy, Medium, Hard, Extreme. <b className="text-white">One miss ends the run.</b>
      </p>
      <button
        onClick={onStart}
        className="mt-auto w-full rounded-[4px] bg-geo-orange py-6 text-[22px] font-extrabold uppercase tracking-[0.12em] text-white active:bg-geo-orange-hover"
        data-testid="start-button"
      >
        Start
      </button>
    </div>
  );
}

export function WatchView({ view }: { view: ViewOf<"watch"> }) {
  const label = TARGET_LABELS[view.target];
  const tier = tierInfo(view.tier);
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="flex items-center gap-3">
        <span className="geo-caption text-[12px] text-white/60">
          Level {pad2(view.level)} / {TOTAL_LEVELS}
        </span>
        <TierBadge tier={view.tier} size="sm" />
      </div>
      {view.stage === "tier" ? (
        <>
          <p className="geo-kicker mt-10 text-[13px]">Tier {pad2(tier.index + 1)} unlocked</p>
          <p className="geo-hero mt-2 text-[48px]">{tier.label}</p>
          <p className="mt-2 text-[16px] text-white/70">{tier.blurb}</p>
        </>
      ) : (
        <>
          <p className="geo-h mt-10 text-[18px] text-white/70">Count the</p>
          <TargetIcon kind={view.target} size={112} className="mt-4 rounded-[8px] ring-1 ring-white/20" />
          <p className="geo-hero mt-4 text-[36px]">{label.plural}</p>
          <p className="mt-2 max-w-[300px] text-[14px] text-white/60">{TARGET_HINTS[view.target]}</p>
          <p className={`geo-h mt-10 text-[20px] ${view.stage === "expose" ? "pulse-soft text-geo-orange" : "text-white/80"}`}>
            {view.stage === "expose" ? "Eyes on the big screen" : "Get ready…"}
          </p>
        </>
      )}
    </div>
  );
}

export function RevealView({ view }: { view: ViewOf<"reveal"> }) {
  const label = TARGET_LABELS[view.target];
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center" data-testid="phone-reveal" data-correct={view.correct}>
      <div className={`flex h-[96px] w-[96px] items-center justify-center rounded-full ${view.correct ? "bg-white" : "bg-geo-orange"}`}>
        {view.correct ? (
          <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
            <path d="M12 25 l8 8 l16 -18" fill="none" stroke="#091926" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
            <path d="M12 12 L32 32 M32 12 L12 32" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="geo-hero mt-6 text-[38px]">{view.correct ? "Correct" : view.answer === null ? "Time's up" : "Missed"}</p>
      <p className="mt-2 text-[16px] text-white/70">
        You said <b className="text-white">{view.answer ?? "—"}</b> · there were <b className="text-white">{view.truth}</b> {label.plural}
      </p>
      <p className="tabular mt-8 text-[44px] font-extrabold leading-none">+{view.points}</p>
      <p className="geo-caption mt-2 text-[12px] text-white/60">Score {formatScore(view.score)}</p>
      <p className="mt-10 text-[15px] text-white/60">{view.gameOver ? "Run complete. Your results are on the big screen." : "Next level coming up…"}</p>
    </div>
  );
}

export function ResultsView({ view }: { view: ViewOf<"results"> }) {
  return (
    <div className="flex flex-1 flex-col" data-testid="phone-results">
      <p className="geo-kicker text-[13px]">Run complete</p>
      <h1 className="geo-h mt-2 text-[30px]">
        Your <span className="text-geo-orange">results</span>
      </h1>
      <p className="tabular mt-6 text-[64px] font-extrabold leading-none">{formatScore(view.score)}</p>
      <p className="geo-caption mt-1 text-[11px] text-white/60">Points</p>
      <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
        {[
          ["Accuracy", formatPct(view.accuracyPct)],
          ["Avg reaction", formatSeconds(view.avgReactionMs)],
          ["Levels", `${view.levelsCleared}/${TOTAL_LEVELS}`],
          ["Rank", view.rank ? `#${view.rank}` : "…"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="geo-caption text-[11px] text-white/60">{k}</dt>
            <dd className="tabular mt-1 text-[26px] font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 rounded-[6px] border-l-[5px] border-geo-orange bg-geo-panel px-5 py-4">
        <p className="geo-kicker text-[11px]">Our AI</p>
        <p className="mt-1 text-[16px] font-bold">
          {AI_BENCHMARK.reactionLabel} · {AI_BENCHMARK.accuracyPct}% accuracy · all {TOTAL_LEVELS} levels
        </p>
      </div>
      <p className="mt-auto pt-8 text-center text-[14px] text-white/55">Thanks for playing. Scan the big screen again to play another run.</p>
    </div>
  );
}
