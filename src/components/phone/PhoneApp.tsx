"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { HEARTBEAT_MS, type PhoneToDisplay, type PhoneView } from "@/game/protocol";
import { randomId } from "@/lib/id";
import { createTransport, type Transport } from "@/realtime";
import { AnswerPad } from "./AnswerPad";
import { NicknameForm } from "./NicknameForm";
import { ResultsView, RevealView, StartView, WatchView } from "./Views";

type Status = "connecting" | "accepted" | "busy" | "expired";
type Outgoing = PhoneToDisplay extends infer T ? (T extends unknown ? Omit<T, "clientId"> : never) : never;

function clientIdFor(room: string): string {
  const key = `monitoring-challenge:client:${room}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Phone controller: a thin client that renders whatever the display says. */
export function PhoneApp({ room }: { room: string }) {
  const [clientId] = useState(() => clientIdFor(room));
  const [status, setStatus] = useState<Status>("connecting");
  const [view, setView] = useState<PhoneView | null>(null);
  const transportRef = useRef<Transport | null>(null);

  useEffect(() => {
    const transport = createTransport(room, "phone");
    transportRef.current = transport;
    let welcomed = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const offStatus = transport.onStatus((s) => {
      if (s !== "open") return;
      transport.send({ type: "join", clientId });
      // Nobody answers in a room the display has already left.
      if (!welcomed && !expiry) expiry = setTimeout(() => !welcomed && setStatus("expired"), 6000);
    });
    const offMessage = transport.onMessage((msg) => {
      if (msg.type === "welcome" && msg.to === clientId) {
        welcomed = true;
        setStatus(msg.accepted ? "accepted" : "busy");
      } else if (msg.type === "view" && msg.to === clientId) {
        welcomed = true;
        setStatus("accepted");
        setView((prev) => (prev && JSON.stringify(prev) === JSON.stringify(msg.view) ? prev : msg.view));
      }
    });
    const heartbeat = setInterval(() => transport.send({ type: "ping", clientId }), HEARTBEAT_MS);
    const onLeave = () => transport.send({ type: "leave", clientId });
    window.addEventListener("pagehide", onLeave);
    return () => {
      clearTimeout(expiry);
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onLeave);
      offStatus();
      offMessage();
      transport.close();
    };
  }, [room, clientId]);

  const send = useCallback(
    (msg: Outgoing) => transportRef.current?.send({ ...msg, clientId } as PhoneToDisplay),
    [clientId],
  );

  // Keep the screen awake during a run where supported (needs https).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  let body: React.ReactNode;
  if (status === "busy") {
    body = (
      <Notice kicker="Challenge in progress" title="Someone is playing right now">
        Hang tight. When the big screen shows the QR code again, scan it to take your turn.
      </Notice>
    );
  } else if (status === "expired") {
    body = (
      <Notice kicker="Code expired" title="Scan the screen again">
        This QR code belongs to an earlier session. Scan the code currently on the big screen.
      </Notice>
    );
  } else if (status === "connecting" || !view) {
    body = (
      <Notice kicker="Connecting" title="Linking to the big screen…">
        Make sure your phone is on the same Wi-Fi as the challenge screen.
      </Notice>
    );
  } else {
    switch (view.screen) {
      case "nickname":
        body = <NicknameForm onSubmit={(nickname) => send({ type: "ready", nickname })} />;
        break;
      case "instructions":
        body = <StartView nickname={view.nickname} onStart={() => send({ type: "start" })} />;
        break;
      case "watch":
        body = <WatchView view={view} />;
        break;
      case "answer":
        body = (
          <AnswerPad
            key={`answer-${view.level}`}
            view={view}
            onSubmit={(value, reactionMs) => send({ type: "answer", level: view.level, value, reactionMs })}
          />
        );
        break;
      case "reveal":
        body = <RevealView view={view} />;
        break;
      case "results":
        body = <ResultsView view={view} />;
        break;
      case "ended":
        body = (
          <Notice kicker="Thanks for playing" title="See you next time">
            Scan the QR code on the big screen to play again.
          </Notice>
        );
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-geo-space px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-white" data-testid="phone" data-status={status} data-screen={view?.screen ?? ""}>
      <header className="flex items-center justify-between">
        <Wordmark size={17} subline={false} />
        <span className="geo-caption rounded-sm border border-white/20 px-2 py-1 text-[10px] text-white/70">Room {room}</span>
      </header>
      <div className="flex flex-1 flex-col pt-6">{body}</div>
    </main>
  );
}

function Notice({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <div className="my-auto">
      <p className="geo-kicker text-[13px]">{kicker}</p>
      <h1 className="geo-h mt-2 text-[28px] leading-tight">{title}</h1>
      <p className="mt-3 text-[16px] leading-[1.6] text-white/70">{children}</p>
    </div>
  );
}
