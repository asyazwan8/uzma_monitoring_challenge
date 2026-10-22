"use client";

import { useEffect, useState } from "react";
import { CUE_NAMES, detectPan, musicFromKey, type CueName } from "@/audio/cues";
import { getGameAudio } from "@/audio/engine";
import { AUDIO_TEST_NAMES, DEMO_PARAMS, MUSIC_TEST_KEYS, renderOffline, type RenderMetrics } from "@/audio/offline";
import { useAudioSnapshot, useMuteShortcut } from "@/audio/useGameAudio";
import { revealStaggerMs, revealVerdictDelayMs } from "@/game/levels";

/**
 * Dev-only audition page for the display's sound: every cue, every music mode,
 * the live-window and reveal sequences, plus offline level checks. Also exposes
 * window.__audioTest for the Playwright audio spec.
 */

declare global {
  interface Window {
    __audioTest?: {
      names: string[];
      render(name: string, seconds: number): Promise<RenderMetrics>;
    };
  }
}

const MUSIC_MODES = ["silent", ...MUSIC_TEST_KEYS.filter((k) => k !== "game3-live"), "game0-live", "game3-live"];

const btn = "rounded-[4px] bg-geo-panel px-3 py-2 text-[13px] font-semibold text-white hover:bg-geo-steel disabled:opacity-40";
const btnOn = "rounded-[4px] bg-geo-orange px-3 py-2 text-[13px] font-semibold text-white";

function db(x: number): string {
  return x > 0 ? `${(20 * Math.log10(x)).toFixed(1)} dB` : "-inf";
}

export function AudioLab() {
  const snapshot = useAudioSnapshot(true);
  useMuteShortcut(true);
  const [status, mutedFlag, volumeText] = snapshot.split("|");
  const muted = mutedFlag === "1";
  const volume = Number(volumeText) || 0;
  const [music, setMusic] = useState("silent");
  const [metrics, setMetrics] = useState<Record<string, RenderMetrics | string>>({});
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const audio = getGameAudio();
    if (audio) {
      audio.debug = true;
      audio.init();
    }
    window.__audioTest = { names: [...AUDIO_TEST_NAMES], render: renderOffline };
    return () => {
      delete window.__audioTest;
      getGameAudio()?.setMusic({ kind: "silent" });
    };
  }, []);

  const audio = () => getGameAudio();

  const playCue = (cue: CueName) => {
    const a = audio();
    if (!a) return;
    if (cue === "countdown") {
      const t = a.currentTime + 0.02;
      [3, 2, 1].forEach((n, k) => a.schedule("countdown", t + k, { n }));
    } else {
      a.play(cue, DEMO_PARAMS[cue]);
    }
  };

  const chooseMusic = (key: string) => {
    const mode = musicFromKey(key);
    if (!mode) return;
    setMusic(key);
    audio()?.setMusic(mode);
  };

  /** The live window: go, riser and ticks in the last 3 s, time up at 10 s. */
  const liveWindow = () => {
    const a = audio();
    if (!a) return;
    a.beginPhase(`lab-live@${Date.now()}`);
    const t = a.currentTime + 0.02;
    a.alignMusic(t);
    a.schedule("go", t);
    a.schedule("riser", t + 7, { durMs: 3000 });
    for (const s of [7, 8, 9]) a.schedule("tickUrgent", t + s);
    a.schedule("timeUp", t + 10);
  };

  /** A reveal of n boxes with the given verdict, timed like the game's overlay. */
  const reveal = (n: number, verdict: "correct" | "wrong" | "timeout") => {
    const a = audio();
    if (!a) return;
    a.beginPhase(`lab-reveal@${Date.now()}`);
    a.duck("reveal", true);
    const t = a.currentTime + 0.02;
    if (verdict !== "timeout") a.schedule("lock", t);
    const pings = Math.min(n, 30);
    for (let i = 0; i < pings; i++) a.schedule("detect", t + (i * revealStaggerMs(n)) / 1000, { i, n: pings, pan: detectPan(i) });
    a.schedule(verdict, t + revealVerdictDelayMs(n) / 1000);
    setTimeout(() => audio()?.duck("reveal", false), 4500);
  };

  const runChecks = async () => {
    setChecking(true);
    const out: Record<string, RenderMetrics | string> = {};
    for (const name of AUDIO_TEST_NAMES) {
      try {
        out[name] = await renderOffline(name, 3.5);
      } catch (e) {
        out[name] = String(e);
      }
      setMetrics({ ...out });
    }
    setChecking(false);
  };

  return (
    <main className="min-h-screen bg-geo-space p-6 text-white" data-testid="audio-lab">
      <p className="geo-kicker text-xs">Dev preview</p>
      <h1 className="geo-h mb-6 text-2xl">Audio lab</h1>

      <section className="mb-8 flex flex-wrap items-center gap-4">
        <p className="geo-caption text-[13px]">
          Status{" "}
          <span data-testid="audio-status" className={status === "running" ? "text-white" : "text-geo-orange"}>
            {status}
          </span>
        </p>
        {status === "locked" && <p className="text-[13px] text-geo-muted">Click anywhere to start the audio.</p>}
        <button type="button" className={muted ? btnOn : btn} onClick={() => audio()?.toggleMute()}>
          {muted ? "Unmute" : "Mute"} (M)
        </button>
        <label className="geo-caption flex items-center gap-3 text-[13px]">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => audio()?.setVolume(Number(e.target.value))}
            className="w-48 accent-geo-orange"
            aria-label="Volume"
          />
          <span className="tabular w-10">{Math.round(volume * 100)}%</span>
        </label>
      </section>

      <section className="mb-8">
        <h2 className="geo-h mb-3 text-[15px]">Cues</h2>
        <div className="flex flex-wrap gap-2">
          {CUE_NAMES.map((cue) => (
            <button key={cue} type="button" className={btn} data-cue={cue} onClick={() => playCue(cue)}>
              {cue}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="geo-h mb-3 text-[15px]">Sequences</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={liveWindow}>
            Live window (10 s)
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              const a = audio();
              a?.beginPhase(`lab-answer@${Date.now()}`);
              a?.play("lock");
            }}
          >
            Answer now (cancels ticks)
          </button>
          <button type="button" className={btn} onClick={() => reveal(5, "correct")}>
            Reveal 5 · correct
          </button>
          <button type="button" className={btn} onClick={() => reveal(14, "wrong")}>
            Reveal 14 · wrong
          </button>
          <button type="button" className={btn} onClick={() => reveal(24, "timeout")}>
            Reveal 24 · timeout
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="geo-h mb-3 text-[15px]">Music</h2>
        <p className="mb-3 text-[13px] text-geo-muted">Changes take effect at the next bar line (2 s at 120 bpm); the live flag at once, results restarts the bed.</p>
        <div className="flex flex-wrap gap-2">
          {MUSIC_MODES.map((key) => (
            <button key={key} type="button" className={music === key ? btnOn : btn} data-music={key} onClick={() => chooseMusic(key)}>
              {key}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="geo-h mb-3 text-[15px]">Offline level check</h2>
        <button type="button" className={btn} disabled={checking} onClick={() => void runChecks()}>
          {checking ? "Rendering…" : "Render all (3.5 s each)"}
        </button>
        {Object.keys(metrics).length > 0 && (
          <table className="tabular mt-4 text-[13px]">
            <thead className="geo-caption text-left text-geo-muted">
              <tr>
                <th className="pr-6">Name</th>
                <th className="pr-6">Peak</th>
                <th className="pr-6">RMS</th>
                <th>Non-finite</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics).map(([name, m]) => (
                <tr key={name}>
                  <td className="pr-6">{name}</td>
                  {typeof m === "string" ? (
                    <td colSpan={3} className="text-geo-orange">
                      {m}
                    </td>
                  ) : (
                    <>
                      <td className={`pr-6 ${m.peak > 0.99 ? "text-geo-orange" : ""}`}>{db(m.peak)}</td>
                      <td className="pr-6">{db(m.rms)}</td>
                      <td>{m.nonFinite}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
