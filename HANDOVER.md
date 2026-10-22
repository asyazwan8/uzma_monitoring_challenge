# HANDOVER: connect a database and deploy to Vercel

> **To the coding agent reading this:** this is your task brief. Read it fully before changing code. The human developer will review and approve what you do. Work in small, verified steps, and keep every existing test passing.

## 1. What this project is

**The Monitoring Challenge** is a booth game for Geospatial AI (An Uzma Company):

- A big screen (the **display**) shows a procedurally generated satellite-style city.
- Players scan a QR code. Their **phone** becomes the controller.
- Players count a target (blue houses, circular lakes, trees, cars) and type the number within 15 seconds.
- A run has 20 levels in 4 tiers, and players get 3 lives.
- At the end they see their accuracy and average answer time compared with "our AI", plus a leaderboard.

Stack: **Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4**. There is no database and no hosted services yet.

> This is a newer Next.js than most training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (route handlers, env vars, config). `AGENTS.md` says the same.

Today the game is a **local proof of concept**. Two parts are local stand-ins, and both sit behind small interfaces:

| Concern | Today (local PoC) | Your job |
|---|---|---|
| Leaderboard storage | `localStorage` in the display's browser (`src/leaderboard/localStorageRepository.ts`) | A real database behind a Next.js API route |
| Phone ↔ display messaging | A WebSocket relay process, `server/relay.ts` on port 3001 (`src/realtime/wsTransport.ts`) | A hosted realtime service. Vercel functions **cannot** hold WebSockets, so the relay cannot run on Vercel. |

Then deploy to **Vercel** so the display is `https://<project>.vercel.app/` and phones can join from any network.

Background reading (in order): `README.md`, `docs/HANDOFF.md` (interfaces, SQL, adapter sketch), `docs/DESIGN.md` (brand rules for any UI you touch).

## 2. Ask the human first

Before you start, confirm these with the developer. Suggested defaults are in brackets.

1. **Provider.** [**Supabase**: one project gives Postgres for the leaderboard and Realtime broadcast channels for messaging.] Alternatives: Neon or Vercel Postgres for the database, and Ably or Pusher for realtime.
2. **Accounts and keys.** The developer creates the Supabase project and Vercel project and gives you the env values. **Never invent, print or commit secrets.**
3. **Leaderboard scope.** [One global board.] Alternatively, one board per event, which needs an `event` column and an `NEXT_PUBLIC_EVENT_ID` env var.
4. **Write protection.** [A shared kiosk secret: the display sends `x-kiosk-key`, and the API route checks it against the server env var `KIOSK_WRITE_KEY`.]

## 3. Setup

```bash
npm install          # .npmrc sets legacy-peer-deps=true; keep it
npm run typecheck && npm run lint && npm test   # must be green before you start
npm run dev:lan      # local game: http://localhost:3000 (+ relay on :3001)
```

With no phone available, open `http://localhost:3000/?transport=broadcast` and then the phone link shown under the QR code in a second window.

## 4. Task A: leaderboard database

**Interface** (keep its methods; the one allowed change is widening `rank` to `number | null`, see step 3): `src/leaderboard/repository.ts`

```ts
interface LeaderboardRepository {
  submit(entry: NewLeaderboardEntry): Promise<{ entry: LeaderboardEntry; rank: number }>;
  top(limit: number): Promise<LeaderboardEntry[]>;
}
```

The display calls `submit` once per finished run and `top(10)` for the boards (see `src/components/display/useGameHost.ts`). Ranking order is `compareEntries`: score descending, then `avgReactionMs` ascending (nulls last), then earliest `createdAt`.

Steps:

1. **Schema.** Create a migration file, for example `db/migrations/001_leaderboard.sql`, starting from the SQL in `docs/HANDOFF.md`. The columns map to `LeaderboardEntry`:
   - `nickname`
   - `score`
   - `levels_cleared` (0–20)
   - `accuracy_pct` (0–100, one decimal)
   - `avg_reaction_ms` (nullable)
   - `created_at`

   Keep the rank index. If you use Supabase, enable RLS and give `anon` **no** direct access. All access goes through the API route, using the service-role key server-side.
2. **API route** `src/app/api/leaderboard/route.ts`:
   - `GET ?limit=10` returns `LeaderboardEntry[]`, with limit clamped to 1–50.
   - `POST` takes `NewLeaderboardEntry` and returns `{ entry, rank }`.
     - Validate it on the server: nickname via `cleanNickname` in `src/game/protocol.ts` (non-empty, at most 16 characters), integer bounds, and finite numbers.
     - Reject bad input with 400, and a missing or invalid `x-kiosk-key` with 401 (if Q4 = secret).
   - Compute `rank` in the database: `1 + count(*)` of rows that sort before the new row under `compareEntries`.
   - Database credentials are server-only env vars (no `NEXT_PUBLIC_` prefix). Use `export const runtime = "nodejs"`.
3. **Client repository** `src/leaderboard/apiRepository.ts` that `fetch`es those routes. Return it from `createLeaderboard()` in `src/leaderboard/index.ts` when `NEXT_PUBLIC_LEADERBOARD=api`.
   - Keep `localStorageRepository` as the default, so local runs without a database still work.
   - On a network error, `submit` must not crash the results screen: log it, and resolve with `rank: null`. That means widening `rank` to `number | null` in the return type. Check that the display handles `null` (it already shows "…" while waiting).
4. **Tests.**
   - Unit-test the validation and ranking logic as pure functions; don't hit a live database in `npm test`.
   - Optionally add an integration test that runs only when `DATABASE_URL` is set.

## 5. Task B: realtime transport

**Interface** (do not change it): `src/realtime/transport.ts`

```ts
interface Transport {
  readonly kind: string;
  send(message: GameMessage): void;
  onMessage(handler: (message: GameMessage) => void): () => void;
  onStatus(handler: (status: "connecting" | "open" | "closed") => void): () => void;
  close(): void;
}
```

Semantics to preserve:

- There is **one channel per room code** (5 characters, rotated after every run).
- `send` reaches every **other** member of the room. Members ignore messages from their own role.
- `onStatus("open")` fires on every (re)connect. The phone re-sends `join` on each open.
- No delivery guarantees are needed: the phone pings every 2.5 s and the display replies with the current view, so lost messages heal themselves.

Steps:

1. `npm install @supabase/supabase-js`. Write `src/realtime/supabaseTransport.ts`, following the sketch in `docs/HANDOFF.md`: Broadcast on channel `mc:<room>`, with `self: false`, and the payload `{ role, data }`.
2. Register it in `src/realtime/index.ts`. Add `"supabase"` to `TransportKind`, select it when `NEXT_PUBLIC_TRANSPORT=supabase`, and keep the `?transport=broadcast` URL override for testing.
3. Map Supabase subscribe statuses to `connecting`, `open` and `closed`. Clean up the channel in `close()`. Make sure React StrictMode double-mounting doesn't leave duplicate subscriptions.
4. The phone view shows a "Linking to the big screen…" hint that mentions the local relay. Make that hint conditional on `transportKind() === "ws"` (it already is; check it stays that way).

## 6. Task C: deploy to Vercel

1. Make sure `npm run build` passes locally with production env values.
2. Create the Vercel project (framework preset Next.js, default build settings). Root directory: the repo root.
3. Set the environment variables (Production and Preview) and document them all in `.env.example`:

   | Variable | Example | Exposed to browser |
   |---|---|---|
   | `NEXT_PUBLIC_TRANSPORT` | `supabase` | yes |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xyz.supabase.co` | yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (Realtime only) | yes |
   | `NEXT_PUBLIC_LEADERBOARD` | `api` | yes |
   | `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` | secret | **no** |
   | `KIOSK_WRITE_KEY` + `NEXT_PUBLIC_KIOSK_KEY` | shared secret, if Q4 = secret | the `NEXT_PUBLIC_` copy is visible. It's only a speed bump, so say so in the docs. |
   | `NEXT_PUBLIC_PUBLIC_URL` | `https://<project>.vercel.app` | yes (optional; the display falls back to its own origin) |

4. **Don't deploy the relay.** `server/relay.ts` and the `relay`, `dev:lan`, `kiosk` and `booth` scripts stay for local use only. On Vercel the display uses its own origin, so the QR code points at `https://<project>.vercel.app/play/<ROOM>`.
5. `src/app/api/lan-info` and `/dev/*` pages are harmless in production. Optionally hide `/dev/*` when `NODE_ENV === "production"`.
6. Deploy, then run the checks in section 8 against the live URL.

## 7. Guardrails: do not break these

- **Scoring and anti-cheat stay on the display.** The phone sends only `{ value, reactionMs }`. `boundedReactionMs` in `src/game/engine.ts` bounds answer time by the display's clock. Never let the phone submit a score or write to the database.
- **The game reducer stays pure** (`src/game/engine.ts`). Network and database code lives in hooks and adapters only.
- **Sound needs a user gesture** on the display page, or Chrome launched with `--autoplay-policy=no-user-gesture-required` (see the README "Sound" section). Don't remove the "Click anywhere to turn on sound" card.
- **City generation** guarantees exact counts (`tests/generate.test.ts`). Don't touch `src/city/*` for this task.
- Keep the design system (`docs/DESIGN.md`) for any new UI: Montserrat, uppercase ExtraBold headings, and orange (`#F26522`) as an accent only.
- Don't commit secrets, `.env.local` or build output.

## 8. Definition of done

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
2. `CHROMIUM_PATH=<chrome> npm run e2e` passes locally. The e2e suite uses `?transport=broadcast` and the localStorage board, so it must keep working without cloud services.
3. On the **deployed** URL:
   - The display shows a QR code pointing at the Vercel domain.
   - A phone on **mobile data** (not the same Wi-Fi) can join, enter a nickname, play, and see the results.
   - The run appears on the leaderboard and is still there after reloading the display and on a second device.
   - A `POST /api/leaderboard` without the kiosk key is rejected (if Q4 = secret).
   - No errors in the browser console or in Vercel's runtime logs during a full run.
4. `README.md` gains a "Deployed setup" section (env vars and how to point the booth TV at the URL). `docs/HANDOFF.md` is updated to say what was actually built.

## 9. Map of the code

```
src/app/page.tsx                 display (big screen); query: ?debug=1 ?speed=0.25 ?transport=broadcast ?sound=0
src/app/play/[room]/page.tsx     phone controller
src/components/display/          display screens; useGameHost.ts wires transport + leaderboard
src/components/phone/            phone screens and keypad
src/game/                        levels.ts (tuning), engine.ts (pure reducer), protocol.ts (messages), scoring.ts
src/realtime/                    Transport interface + ws / BroadcastChannel adapters  ← add Supabase here
src/leaderboard/                 Repository interface + localStorage store            ← add API repo here
src/audio/                       Web Audio music and SFX (display only)
src/city/                        procedural SVG city generator and renderer
server/relay.ts                  local WebSocket relay (not for Vercel)
tests/, e2e/                     Vitest unit tests, Playwright end-to-end tests
```
