# Flipbook Phone

*Working title. Rename before branding: change `APP_NAME` in `shared/src/constants.ts` and the `<title>` in `client/index.html`.*

An online party game where players pass flipbooks around and build animations one frame at a time. This first build ships **Relay mode**: everyone writes a secret word and draws frame 1, then each turn you see only the previous frame (onion-skinned) and draw the next one. At the end every word is revealed and every animation plays.

## Running it

Requires Node 22+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Create a room, then use **+ Add a test bot** (dev only) to fill seats so one person can play a whole game. To play with real people on your network, open more tabs or browsers. Each tab is its own player.

| Command | What it does |
|---|---|
| `npm run dev` | Game server on :3001 plus the Vite client on :5173 (proxies the socket) |
| `npm test` | Scheduler and rules tests (Vitest) |
| `npm run typecheck` | Typechecks all three packages |
| `npm run simulate` | Headless 5-player game against a running dev server, with one player dropping out mid-game |
| `npm run build && npm start` | Production: one Node process serves the built client and the socket on `$PORT` |

Set `ALLOW_BOTS=1` to enable test bots in production.

## Layout

```
shared/   Types, socket protocol, settings, palette, Relay scheduler, stroke simplification
server/   Node + Socket.IO. Rooms, phases, timers and chains live here (the server is authoritative)
client/   React + Vite. Home, lobby, drawing canvas, waiting room, reveal, GIF export
```

## How the core pieces work

- **Rooms.** 4-letter codes (no I or O), no accounts. A seat is a `{playerId, token}` kept in `sessionStorage`, so a refresh rejoins the same seat and each tab is a separate player.
- **Rounds.** The server owns the timer. Round 0 is "secret word + frame 1" on your own chain. Later rounds go through `assignRound` (`shared/src/scheduler.ts`): never your own chain, never the same chain twice in a row, balanced contributions. It uses bipartite matching seeded from the room ID and game number, so a schedule can be replayed. A round ends early once every connected player has pressed Done.
- **Robustness.** Clients stream their in-progress frame to the server as drafts, so a timeout or refresh loses nothing. A blank or timed-out frame becomes a copy of the previous frame, marked *held* in the reveal. A blank word gets a random fallback. Disconnected players are left out of the next assignments, and their chain keeps going.
- **Drawing data.** Strokes are point arrays in normalized 0–1 coordinates on a square canvas, simplified with Ramer–Douglas–Peucker and validated and capped on the server. All players share one limited palette and fixed brush sizes.
- **Privacy of the word.** During drawing, a client only ever receives the onion-skin frames for its own turn. Words and full chains are sent only at the reveal.
- **Reveal.** The host steps through the flipbooks. Each one shows the word, plays slowly with artist credits, then loops at full speed. Viewers can scrub, open the filmstrip, or download a watermarked GIF (encoded in the browser with `gifenc`).

## What's next (from the plan)

Not built yet: Classic mode, pause, reactions and voting, MP4 export, music, a mobile-tuned canvas, fill bucket, hold-frame and FPS controls in the editor. Still open: the final name, whether text is allowed in drawings, and default timers (tune these from playtests).
