import { Wordmark } from "@/components/brand/Wordmark";
import { TargetIcon } from "@/components/brand/TargetIcon";
import { LEVELS, ROUND_MS, TARGET_KINDS, TARGET_LABELS, TIERS, gridLabel } from "@/game/levels";
import { pad2 } from "@/lib/format";
import { CityBackdrop } from "./CityBackdrop";

const STEPS = [
  { title: "Watch", body: "A satellite tile of the city appears on this screen." },
  { title: "Count", body: "Count only the target you are given. Look-alikes do not count." },
  {
    title: "Answer fast",
    body: `You have ${ROUND_MS / 1000} seconds. Type the number on your phone while you look. Faster exact answers score more.`,
  },
];

export function InstructionsScreen({ nickname, backdropSeed }: { nickname: string; backdropSeed: number }) {
  return (
    <div className="absolute inset-0" data-testid="screen-instructions">
      <CityBackdrop seed={backdropSeed} scrim="heavy" />
      <header className="absolute left-[96px] right-[96px] top-[56px] flex items-start justify-between">
        <Wordmark size={26} />
        <p className="geo-caption text-[14px] text-white/60">The Monitoring Challenge · Briefing</p>
      </header>

      <section className="rise-in absolute left-[96px] right-[96px] top-[168px]">
        <p className="geo-kicker text-[22px]">Welcome, {nickname}</p>
        <h1 className="geo-hero mt-3 text-[84px]">
          How to <span className="text-geo-orange">play</span>
        </h1>

        <div className="mt-12 grid grid-cols-3 gap-8">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-[8px] border border-white/10 bg-geo-panel/90 p-8">
              <span className="tabular flex h-[56px] w-[56px] items-center justify-center rounded-full bg-geo-orange text-[22px] font-extrabold">
                {pad2(i + 1)}
              </span>
              <h2 className="geo-h mt-6 text-[34px]">{s.title}</h2>
              <p className="mt-3 text-[22px] leading-[1.5] text-white/75">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-[1fr_auto] gap-10">
          <div className="grid grid-cols-4 overflow-hidden rounded-[8px] border border-white/10">
            {TIERS.map((t) => {
              const first = LEVELS[t.levels[0] - 1];
              const last = LEVELS[t.levels[1] - 1];
              return (
                <div key={t.id} className="border-r border-white/10 bg-geo-space/70 px-6 py-5 last:border-r-0">
                  <p className="text-[14px] font-extrabold uppercase tracking-[0.14em] text-geo-orange">
                    {pad2(t.index + 1)} · Levels {t.levels[0]}–{t.levels[1]}
                  </p>
                  <p className="geo-h mt-1 text-[30px]">{t.label}</p>
                  <p className="tabular mt-2 text-[17px] text-white/70">
                    {gridLabel(t.id)} city blocks · {first.count[0]}–{last.count[1]} objects
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-5 rounded-[8px] border border-white/10 bg-geo-space/70 px-6">
            {TARGET_KINDS.map((k) => (
              <div key={k} className="flex flex-col items-center gap-2">
                <TargetIcon kind={k} size={56} className="rounded-[4px]" />
                <span className="geo-caption text-[11px] text-white/70">{TARGET_LABELS[k].plural}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="absolute bottom-[64px] left-[96px] right-[96px] flex items-center justify-between">
        <p className="text-[22px] text-white/70">
          <span className="font-extrabold text-white">One miss ends the run.</span> Clear all 20 levels to match our AI.
        </p>
        <p className="pulse-soft flex items-center gap-4 rounded-[4px] border-2 border-geo-orange px-8 py-4 text-[26px] font-extrabold uppercase tracking-[0.1em]">
          <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden>
            <rect x="1.5" y="1.5" width="19" height="31" rx="4" fill="none" stroke="#F26522" strokeWidth="3" />
            <circle cx="11" cy="27" r="2" fill="#F26522" />
          </svg>
          Press start on your phone
        </p>
      </footer>
    </div>
  );
}
