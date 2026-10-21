import { Wordmark } from "@/components/brand/Wordmark";
import type { LeaderboardEntry } from "@/leaderboard";
import { CityBackdrop } from "./CityBackdrop";
import { LeaderboardTable } from "./LeaderboardTable";
import { Tagline } from "./Tagline";

export function LeaderboardScreen({
  board,
  highlightId,
  rank,
  self,
  secondsLeft,
  backdropSeed,
}: {
  board: LeaderboardEntry[];
  highlightId: string | null;
  rank: number | null;
  self: LeaderboardEntry | null;
  secondsLeft: number;
  backdropSeed: number;
}) {
  const inTop = board.some((e) => e.id === highlightId);
  return (
    <div className="absolute inset-0" data-testid="screen-leaderboard">
      <CityBackdrop seed={backdropSeed} scrim="heavy" />
      <header className="absolute left-[96px] right-[96px] top-[56px] flex items-start justify-between">
        <Wordmark size={26} />
        <p className="geo-caption text-[14px] text-white/60">Next challenger in {secondsLeft}s</p>
      </header>
      <section className="rise-in absolute left-[160px] right-[160px] top-[150px]">
        <p className="geo-kicker text-[20px]">Top 10 operators</p>
        <h1 className="geo-hero mb-10 mt-2 text-[76px]">
          Leader<span className="text-geo-orange">board</span>
        </h1>
        <LeaderboardTable entries={board} highlightId={highlightId} extraRow={!inTop && self && rank ? { entry: self, rank } : null} />
      </section>
      <footer className="absolute bottom-[56px] left-[160px] right-[160px] flex items-center justify-between">
        <Tagline size={22} />
        <p className="geo-caption text-[14px] text-white/50">Scan the QR on the next screen to play</p>
      </footer>
    </div>
  );
}
