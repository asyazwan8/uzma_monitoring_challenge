import { Wordmark } from "@/components/brand/Wordmark";
import { TOTAL_LEVELS, tierInfo, tierForLevel } from "@/game/levels";
import { AI_BENCHMARK, formatSeconds, type RunSummary } from "@/game/scoring";
import { formatPct, formatScore, pad2 } from "@/lib/format";
import { CityBackdrop } from "./CityBackdrop";
import { Tagline } from "./Tagline";

export function ResultsScreen({
  nickname,
  summary,
  rank,
  backdropSeed,
}: {
  nickname: string;
  summary: RunSummary;
  rank: number | null;
  backdropSeed: number;
}) {
  const reached = tierInfo(tierForLevel(Math.max(1, summary.roundsPlayed)));
  const faster = summary.avgReactionMs ? Math.round(summary.avgReactionMs / 0.01) : null;
  return (
    <div className="absolute inset-0" data-testid="screen-results">
      <CityBackdrop seed={backdropSeed} scrim="heavy" />
      <header className="absolute left-[96px] right-[96px] top-[56px] flex items-start justify-between">
        <Wordmark size={26} />
        <p className="geo-caption text-[14px] text-white/60">The Monitoring Challenge · Debrief</p>
      </header>

      <section className="rise-in absolute left-[96px] top-[160px] w-[980px]">
        <p className="geo-kicker text-[22px]">
          {summary.completed ? "All levels cleared" : "Run complete"} · {nickname}
        </p>
        <h1 className="geo-hero mt-3 text-[84px]">
          Your <span className="text-geo-orange">results</span>
        </h1>

        <div className="mt-10 flex items-end gap-16">
          <div>
            <p className="geo-caption text-[15px] text-white/60">Final score</p>
            <p className="tabular text-[150px] font-extrabold leading-none" data-testid="final-score">
              {formatScore(summary.score)}
            </p>
          </div>
          <div className="pb-4">
            <p className="geo-caption text-[15px] text-white/60">Levels cleared</p>
            <p className="tabular text-[64px] font-extrabold leading-none">
              {pad2(summary.levelsCleared)}
              <span className="text-[30px] text-white/45"> / {TOTAL_LEVELS}</span>
            </p>
            <p className="mt-2 text-[18px] text-white/60">Reached {reached.label}</p>
          </div>
          <div className="pb-4">
            <p className="geo-caption text-[15px] text-white/60">Leaderboard</p>
            <p className="tabular text-[64px] font-extrabold leading-none" data-testid="final-rank">
              {rank ? `#${rank}` : "…"}
            </p>
          </div>
        </div>

        <div className="mt-12 space-y-5 border-l-[6px] border-geo-orange pl-8">
          <p className="text-[40px] font-bold leading-tight" data-testid="final-accuracy">
            Your accuracy was <span className="tabular font-extrabold">{formatPct(summary.accuracyPct)}</span>
          </p>
          <p className="text-[40px] font-bold leading-tight" data-testid="final-reaction">
            Your average answer time was <span className="tabular font-extrabold">{formatSeconds(summary.avgReactionMs)}</span>
          </p>
        </div>
      </section>

      <aside className="rise-in absolute right-[96px] top-[290px] w-[640px] overflow-hidden rounded-[8px] bg-geo-panel" style={{ animationDelay: "250ms" }}>
        <div className="border-l-[8px] border-geo-orange p-10">
          <p className="geo-kicker text-[16px]">Benchmark</p>
          <p className="geo-h mt-2 text-[40px] leading-tight">
            Our <span className="text-geo-orange">AI</span> did it in
          </p>
          <p className="tabular mt-6 text-[96px] font-extrabold leading-none">{AI_BENCHMARK.reactionLabel}</p>
          <p className="mt-3 text-[30px] font-bold">with 100% accuracy, all {TOTAL_LEVELS} levels.</p>

          <div className="mt-10 space-y-6">
            {[
              { label: "Accuracy", you: summary.accuracyPct, ai: 100, youLabel: formatPct(summary.accuracyPct), aiLabel: "100%" },
              {
                label: "Levels",
                you: (summary.levelsCleared / TOTAL_LEVELS) * 100,
                ai: 100,
                youLabel: `${summary.levelsCleared}/${TOTAL_LEVELS}`,
                aiLabel: `${TOTAL_LEVELS}/${TOTAL_LEVELS}`,
              },
            ].map((row) => (
              <div key={row.label}>
                <p className="geo-caption mb-2 text-[13px] text-white/60">{row.label}</p>
                <div className="grid grid-cols-[70px_1fr_90px] items-center gap-3 text-[16px]">
                  <span className="font-bold text-white/70">You</span>
                  <span className="h-[10px] rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-white" style={{ width: `${Math.max(2, row.you)}%` }} />
                  </span>
                  <span className="tabular text-right">{row.youLabel}</span>
                  <span className="font-bold text-geo-orange">AI</span>
                  <span className="h-[10px] rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-geo-orange" style={{ width: `${row.ai}%` }} />
                  </span>
                  <span className="tabular text-right">{row.aiLabel}</span>
                </div>
              </div>
            ))}
          </div>
          {faster && (
            <p className="mt-8 text-[18px] text-white/70">
              That is roughly <b className="tabular text-white">{faster.toLocaleString("en-GB")}×</b> faster than your average answer.
            </p>
          )}
        </div>
      </aside>

      <footer className="absolute bottom-[56px] left-[96px] right-[96px] flex items-center justify-between">
        <Tagline size={22} />
        <p className="geo-caption text-[14px] text-white/50">Geospatial AI · Actionable insights from orbit</p>
      </footer>
    </div>
  );
}
