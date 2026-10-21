import type { LeaderboardEntry } from "@/leaderboard";
import { AI_BENCHMARK, formatSeconds } from "@/game/scoring";
import { formatPct, formatScore, pad2 } from "@/lib/format";
import { TOTAL_LEVELS } from "@/game/levels";

const COLS = "grid grid-cols-[96px_1fr_200px_150px_170px_190px] items-center";

/** Full-size leaderboard table (spec-table style on dark: orange header caps, thin dividers). */
export function LeaderboardTable({
  entries,
  highlightId,
  extraRow,
}: {
  entries: LeaderboardEntry[];
  highlightId: string | null;
  /** The player's own row when it falls outside the top list. */
  extraRow?: { entry: LeaderboardEntry; rank: number } | null;
}) {
  const row = (e: LeaderboardEntry, rank: number) => {
    const me = e.id === highlightId;
    return (
      <div
        key={e.id}
        data-testid={me ? "leaderboard-me" : undefined}
        className={`${COLS} relative h-[60px] border-b border-white/10 px-6 text-[22px] ${me ? "bg-white/[0.07] text-white" : "text-white/85"}`}
      >
        {me && <span className="absolute inset-y-0 left-0 w-[6px] bg-geo-orange" />}
        <span className={`tabular font-extrabold ${rank <= 3 ? "text-white" : "text-white/60"}`}>{pad2(rank)}</span>
        <span className="truncate font-bold">
          {e.nickname}
          {me && <span className="ml-3 text-[14px] font-extrabold uppercase tracking-[0.12em] text-geo-orange">You</span>}
        </span>
        <span className="tabular text-right font-extrabold">{formatScore(e.score)}</span>
        <span className="tabular text-right">{e.levelsCleared}/{TOTAL_LEVELS}</span>
        <span className="tabular text-right">{formatPct(e.accuracyPct)}</span>
        <span className="tabular text-right">{formatSeconds(e.avgReactionMs)}</span>
      </div>
    );
  };
  return (
    <div className="w-full">
      <div className={`${COLS} border-b border-white/25 px-6 pb-3 text-[14px] font-extrabold uppercase tracking-[0.14em] text-geo-orange`}>
        <span>Rank</span>
        <span>Operator</span>
        <span className="text-right">Score</span>
        <span className="text-right">Levels</span>
        <span className="text-right">Accuracy</span>
        <span className="text-right">Avg time</span>
      </div>
      <div className={`${COLS} relative h-[60px] border-b border-white/10 bg-geo-panel/80 px-6 text-[20px] text-white/90`}>
        <span className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-geo-muted">Bench</span>
        <span className="font-extrabold">
          G<span className="text-geo-orange">[EO]</span>SPATIAL AI
          <span className="ml-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-geo-muted">Out of competition</span>
        </span>
        <span className="tabular text-right text-geo-muted">—</span>
        <span className="tabular text-right">{TOTAL_LEVELS}/{TOTAL_LEVELS}</span>
        <span className="tabular text-right">{formatPct(AI_BENCHMARK.accuracyPct)}</span>
        <span className="tabular text-right">{AI_BENCHMARK.reactionLabel}</span>
      </div>
      {entries.map((e, i) => row(e, i + 1))}
      {entries.length === 0 && (
        <div className="px-6 py-8 text-[20px] text-white/60">No scores yet. Be the first operator on the board.</div>
      )}
      {extraRow && (
        <>
          <div className="px-6 py-1 text-center text-[20px] tracking-[0.4em] text-white/40">···</div>
          {row(extraRow.entry, extraRow.rank)}
        </>
      )}
    </div>
  );
}
