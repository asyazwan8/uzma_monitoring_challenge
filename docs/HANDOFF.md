# Hand-off: database, realtime and Vercel

The proof of concept runs entirely on one laptop. Two things are local stand-ins that need replacing before a Vercel deployment. Both sit behind an interface, so the game code does not change.

| Concern | PoC implementation | Replace with |
|---|---|---|
| Phone ↔ display messaging | `server/relay.ts` (WebSocket relay on :3001) | A hosted pub/sub such as Supabase Realtime, Ably or Pusher. Vercel functions cannot hold WebSockets. |
| Leaderboard storage | `localStorage` in the display browser | A database behind a Next.js API route |

## 1. Leaderboard database

Interface: [`src/leaderboard/repository.ts`](../src/leaderboard/repository.ts)

```ts
interface LeaderboardRepository {
  submit(entry: NewLeaderboardEntry): Promise<{ entry: LeaderboardEntry; rank: number }>;
  top(limit: number): Promise<LeaderboardEntry[]>;
}
```

The display calls `submit` once per finished run and `top(10)` for the boards. Use the existing `compareEntries` ordering: score descending, then average reaction ascending, then earliest.

Suggested steps:

1. Create the table. Postgres example:

   ```sql
   create table leaderboard (
     id              uuid primary key default gen_random_uuid(),
     nickname        text        not null check (char_length(nickname) between 1 and 16),
     score           integer     not null check (score >= 0),
     levels_cleared  smallint    not null check (levels_cleared between 0 and 20),
     accuracy_pct    numeric(4,1) not null check (accuracy_pct between 0 and 100),
     avg_reaction_ms integer,
     created_at      timestamptz not null default now()
   );
   create index leaderboard_rank on leaderboard (score desc, avg_reaction_ms asc nulls last, created_at asc);
   ```

2. Add API routes, for example `src/app/api/leaderboard/route.ts` with `GET ?limit=10` and `POST`.
   - Validate input on the server: nickname rules match `cleanNickname` in `src/game/protocol.ts`, plus the bounds above.
   - Rank on insert: `select count(*) + 1 from leaderboard where score > $1 or (score = $1 and avg_reaction_ms < $2)` (or equivalent).
   - Keep database credentials server-side. The browser should only call your API route.
3. Implement `createApiRepository()` that `fetch`es those routes, and return it from `createLeaderboard()` in [`src/leaderboard/index.ts`](../src/leaderboard/index.ts).
4. **Anti-cheat note.** Scores are computed on the display, not the phone, so a phone cannot forge a score. A public `POST` route can still be called by anyone, though. Protect it, for example with a shared kiosk secret in a header, a Vercel Firewall rule, or by only accepting writes from the booth's network.

## 2. Realtime transport

Interface: [`src/realtime/transport.ts`](../src/realtime/transport.ts)

```ts
interface Transport {
  send(message: GameMessage): void;
  onMessage(handler: (message: GameMessage) => void): () => void;
  onStatus(handler: (status: "connecting" | "open" | "closed") => void): () => void;
  close(): void;
}
```

The semantics are deliberately small:

- One channel per **room code** (5 characters, rotated after every run).
- `send` reaches **every other** member of the room.
- `onStatus("open")` fires whenever the connection (re)opens. The phone re-sends `join` on every open.
- No presence or delivery guarantees are needed: the phone pings every 2.5 s and the display answers each ping with the current view, so a lost message heals itself.

### Supabase Realtime sketch

```ts
import { createClient } from "@supabase/supabase-js";

export function createSupabaseTransport(room: string, role: Role): Transport {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const channel = supabase.channel(`mc:${room}`, { config: { broadcast: { self: false } } });
  const messages = listeners<GameMessage>();
  const statuses = listeners<TransportStatus>();
  channel
    .on("broadcast", { event: "msg" }, ({ payload }) => payload.role !== role && messages.emit(payload.data))
    .subscribe((status) => statuses.emit(status === "SUBSCRIBED" ? "open" : status === "CLOSED" ? "closed" : "connecting"));
  return {
    kind: "supabase",
    send: (data) => void channel.send({ type: "broadcast", event: "msg", payload: { role, data } }),
    onMessage: messages.add,
    onStatus: statuses.add,
    close: () => void supabase.removeChannel(channel),
  };
}
```

Register it in [`src/realtime/index.ts`](../src/realtime/index.ts), for example as `NEXT_PUBLIC_TRANSPORT=supabase`. Ably works the same way: one channel per room, publish and subscribe, and ignore your own role. If you use Ably, issue tokens from an API route so the key stays server-side.

## 3. Deploy to Vercel

1. Import the repo into Vercel (framework preset: Next.js). No custom build settings are needed.
2. Set environment variables:
   - `NEXT_PUBLIC_TRANSPORT` = your hosted adapter, for example `supabase`
   - the adapter's public keys, for example `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - your database connection string or secret (server-only, no `NEXT_PUBLIC_` prefix)
   - optionally `NEXT_PUBLIC_PUBLIC_URL=https://<project>.vercel.app`. The display falls back to its own origin, which is correct once deployed.
3. `server/relay.ts` and the `relay`, `dev:lan` and `kiosk` scripts are not used on Vercel and can stay for local testing.
4. The display is just `https://<project>.vercel.app/` in a full-screen browser on the booth TV. Phones scan the QR code from any network.

## Useful seams

- **Tuning:** [`src/game/levels.ts`](../src/game/levels.ts) holds counts, viewing times, answer windows, points and city density per level. The tests in `tests/levels.test.ts` enforce "harder every level, clear jump every five levels".
- **New targets:** add a kind to `TargetKind`, a carrier land use and fill rule in `src/city/generate.ts`, a sprite, and labels. The generator test automatically covers every target × level.
- **Game flow and timings:** [`src/game/engine.ts`](../src/game/engine.ts) is a pure reducer (`TIMINGS` at the top), fully unit-tested in `tests/engine.test.ts`.
- **Design system:** [`docs/DESIGN.md`](DESIGN.md). Tokens are in `src/app/globals.css`, and map-only colours are in `src/city/palette.ts`.
