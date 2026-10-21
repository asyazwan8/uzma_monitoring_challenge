"use client";

import { useState } from "react";
import { NICKNAME_MAX, cleanNickname } from "@/game/protocol";

export function NicknameForm({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const clean = cleanNickname(value);
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clean) return;
        setSent(true);
        onSubmit(clean);
      }}
    >
      <p className="geo-kicker text-[13px]">The Monitoring Challenge</p>
      <h1 className="geo-h mt-2 text-[30px] leading-tight">
        Choose your <span className="text-geo-orange">callsign</span>
      </h1>
      <p className="mt-3 text-[15px] leading-[1.6] text-white/70">This is the name shown on the leaderboard.</p>
      <label className="mt-8 block">
        <span className="geo-caption text-[11px] text-white/60">Nickname</span>
        <input
          className="mt-2 w-full rounded-[4px] border-2 border-white/20 bg-geo-panel px-4 py-4 text-[22px] font-bold text-white outline-none placeholder:text-white/30 focus:border-geo-orange"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={NICKNAME_MAX}
          autoFocus
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="e.g. Orbit Hawk"
          data-testid="nickname-input"
        />
      </label>
      <p className="mt-2 text-right text-[12px] text-white/40">
        {value.length}/{NICKNAME_MAX}
      </p>
      <button
        type="submit"
        disabled={!clean || sent}
        className="mt-auto w-full rounded-[4px] bg-geo-orange py-5 text-[18px] font-extrabold uppercase tracking-[0.1em] text-white transition-colors hover:bg-geo-orange-hover disabled:opacity-40"
        data-testid="nickname-submit"
      >
        {sent ? "Joining…" : "Enter the challenge"}
      </button>
    </form>
  );
}
