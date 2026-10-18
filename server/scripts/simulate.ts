/**
 * Headless smoke test: connects N fake players to a running server and plays a
 * whole Relay game. One player drops out partway through to exercise the
 * hold-frame and reassignment paths.
 *
 *   npm run dev -w server        # in one terminal
 *   npm run simulate             # in another (PLAYERS=6 FRAMES=10 to tweak)
 */
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  Frame,
  RevealView,
  RoomView,
  ServerToClientEvents,
  Session,
} from '@flipbook/shared';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const URL = process.env.SERVER_URL ?? 'http://localhost:3001';
const PLAYERS = Number(process.env.PLAYERS ?? 5);
const FRAMES = Number(process.env.FRAMES ?? 8);
const DROP_ROUND = 3;

const connect = () =>
  new Promise<Client>((resolve, reject) => {
    const s: Client = io(URL, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });

const dot = (i: number, round: number): Frame => ({
  strokes: [{ color: '#1d1d1f', size: 0.018, points: [[0.1 + i * 0.05, 0.1 + round * 0.03]] }],
});

async function main() {
  const clients: Client[] = [];
  const sessions: Session[] = [];
  for (let i = 0; i < PLAYERS; i++) clients.push(await connect());

  const create = await clients[0]!.emitWithAck('room:create', { nickname: 'Sim 0', color: '' });
  if (!create.ok) throw new Error(create.error);
  sessions.push(create.session);
  const code = create.session.code;
  for (let i = 1; i < PLAYERS; i++) {
    const res = await clients[i]!.emitWithAck('room:join', { code, nickname: `Sim ${i}`, color: '' });
    if (!res.ok) throw new Error(res.error);
    sessions.push(res.session);
  }
  console.log(`room ${code} with ${PLAYERS} players`);

  clients[0]!.emit('host:settings', { frameCount: FRAMES });

  let lastRound = -1;
  const done = new Promise<RevealView>((resolve) => clients[0]!.on('reveal:data', resolve));
  clients[0]!.on('room:state', (s: RoomView) => {
    if (s.phase === 'drawing' && s.round !== lastRound) {
      lastRound = s.round;
      console.log(`round ${s.round}: ${s.progress.assigned.length} drawing`);
    }
  });

  clients.forEach((c, i) => {
    c.on('turn:start', (turn) => {
      if (!turn) return;
      if (i === PLAYERS - 1 && turn.round === DROP_ROUND) {
        console.log(`  Sim ${i} disconnects mid-turn`);
        c.disconnect();
        return;
      }
      if (turn.prevFrames.length === 0 !== turn.isFirst) throw new Error('onion skin mismatch');
      setTimeout(() => c.emit('turn:submit', { frame: dot(i, turn.round), word: `word ${i}` }), 20 + Math.random() * 50);
    });
  });

  const started = await clients[0]!.emitWithAck('host:start');
  if (!started.ok) throw new Error(started.error);

  const timeout = setTimeout(() => {
    console.error('FAIL: game did not finish within 60s');
    process.exit(1);
  }, 60_000);
  const reveal = await done;
  clearTimeout(timeout);

  let ok = reveal.chains.length === PLAYERS;
  for (const chain of reveal.chains) {
    const held = chain.frames.filter((f) => f.held).length;
    const authors = chain.frames.map((f) => f.authorName.replace('Sim ', '')).join(',');
    console.log(`  "${chain.word}" by ${chain.ownerName}: ${chain.frames.length} frames [${authors}]${held ? ` (${held} held)` : ''}`);
    if (chain.frames.length !== FRAMES) ok = false;
    if (chain.frames[0]?.authorId !== chain.ownerId) ok = false;
    for (let k = 1; k < chain.frames.length; k++) {
      if (chain.frames[k]!.authorId === chain.frames[k - 1]!.authorId) ok = false;
    }
  }
  clients.forEach((c) => c.disconnect());
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
