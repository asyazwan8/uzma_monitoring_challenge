"use client";

import { Wordmark } from "@/components/brand/Wordmark";
import { TargetIcon } from "@/components/brand/TargetIcon";
import { LIVES, ROUND_MS, TARGET_KINDS, TARGET_LABELS, TIERS, gridLabel } from "@/game/levels";
import { formatScore, pad2 } from "@/lib/format";
import type { LeaderboardEntry } from "@/leaderboard";
import { CityBackdrop } from "./CityBackdrop";
import { QrCode } from "./QrCode";
import { Tagline } from "./Tagline";

export function IdleScreen({
  roomCode,
  url,
  board,
  phoneConnected,
  backdropSeed,
}: {
  roomCode: string;
  url: string | null;
  board: LeaderboardEntry[];
  /** A phone has joined and is entering a nickname. */
  phoneConnected: boolean;
  backdropSeed: number;
}) {
  return (
    <div className="absolute inset-0" data-testid="screen-idle">
      <CityBackdrop seed={backdropSeed} detections />

      <header className="absolute left-[96px] right-[96px] top-[56px] flex items-start justify-between">
        <Wordmark size={30} />
        <div className="geo-caption flex items-center gap-3 text-[14px] text-white/75">
          <span className="pulse-soft inline-block h-[10px] w-[10px] rounded-full bg-geo-orange" />
          UZMASAT-1 · Live pass · Optical
        </div>
      </header>

      <section className="absolute left-[96px] top-[190px] w-[1200px]">
        <p className="geo-kicker text-[20px]">Geospatial AI presents</p>
        <h1 className="geo-hero mt-4 text-[96px]">
          The Monitoring
          <br />
          <span className="text-geo-orange">Challenge</span>
        </h1>
        <p className="mt-8 max-w-[800px] text-[27px] leading-[1.5] text-white/80">
          Count what matters from orbit. {ROUND_MS / 1000} seconds a level, {LIVES} lives, one question: can you see what our AI
          sees?
        </p>
        <div className="mt-10 flex gap-8">
          {TARGET_KINDS.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <TargetIcon kind={k} size={52} className="rounded-[4px] ring-1 ring-white/15" />
              <span className="geo-caption max-w-[130px] text-[15px] leading-tight text-white/85">{TARGET_LABELS[k].plural}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center gap-3">
          {TIERS.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="rounded-sm border border-white/20 bg-geo-space/60 px-4 py-2 text-[15px] font-extrabold uppercase tracking-[0.12em]">
                <span className="mr-2 text-geo-orange">{pad2(i + 1)}</span>
                {t.label}
                <span className="ml-2 font-semibold text-white/50">{gridLabel(t.id)}</span>
              </span>
              {i < TIERS.length - 1 && <span className="h-px w-5 bg-white/25" />}
            </div>
          ))}
        </div>
      </section>

      <aside className="absolute right-[96px] top-[176px] w-[452px]">
        <div className="border-l-[6px] border-geo-orange pl-5">
          <p className="geo-h text-[30px] leading-tight">
            Scan to take
            <br />
            <span className="text-geo-orange">the challenge</span>
          </p>
        </div>
        <div className="mt-6 flex h-[452px] w-[452px] items-center justify-center rounded-[16px] bg-white shadow-[0_8px_24px_rgba(9,25,38,0.16)]">
          {phoneConnected ? (
            <div className="rise-in flex flex-col items-center px-10 text-center text-geo-ink" data-testid="phone-connected">
              <svg width="96" height="96" viewBox="0 0 48 48" aria-hidden>
                <circle cx="24" cy="24" r="22" fill="#F26522" />
                <path d="M14 25 l7 7 l14 -15" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="geo-h mt-6 text-[28px]">Phone connected</p>
              <p className="mt-3 text-[20px] text-geo-graphite">Enter your nickname on your phone to continue.</p>
            </div>
          ) : url ? (
            <QrCode value={url} size={380} />
          ) : (
            <span className="text-geo-grey">Preparing link…</span>
          )}
        </div>
        <p className="geo-caption mt-5 flex justify-between text-[14px] text-white/70">
          <span>
            Room <span className="text-white" data-testid="room-code">{roomCode}</span>
          </span>
          <span className="max-w-[300px] truncate normal-case tracking-normal text-white/50">{url?.replace(/^https?:\/\//, "")}</span>
        </p>
      </aside>

      <section className="absolute bottom-[112px] left-[96px] right-[96px]">
        <div className="mb-4 flex items-baseline justify-between">
          <p className="geo-kicker text-[16px]">Top operators</p>
          <p className="geo-caption text-[13px] text-white/50">Benchmark · Geospatial AI · 100% accuracy · 0.00001 s</p>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }, (_, i) => board[i]).map((e, i) => (
            <div key={e?.id ?? i} className="flex h-[92px] items-center gap-4 rounded-[8px] border border-white/10 bg-geo-panel/85 px-5">
              <span className={`tabular text-[30px] font-extrabold ${i === 0 ? "text-geo-orange" : "text-white/40"}`}>{pad2(i + 1)}</span>
              {e ? (
                <span className="min-w-0">
                  <span className="block truncate text-[20px] font-bold">{e.nickname}</span>
                  <span className="tabular block text-[16px] text-white/60">{formatScore(e.score)} pts</span>
                </span>
              ) : (
                <span className="text-[16px] text-white/35">Open slot</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="absolute bottom-[44px] left-[96px]">
        <Tagline size={20} />
      </footer>
    </div>
  );
}
