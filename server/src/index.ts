import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { APP_NAME, ROOM_CODE_LENGTH, type JoinPayload, type Session } from '@flipbook/shared';
import { Room, type GameSocket, type IO } from './room';

const PORT = Number(process.env.PORT ?? 3001);
const PRODUCTION = process.env.NODE_ENV === 'production';
const BOTS_ALLOWED = process.env.ALLOW_BOTS === '1' || !PRODUCTION;
// No I or O, so codes can't be confused with 1 and 0.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const app = express();
const httpServer = createServer(app);
const io: IO = new Server(httpServer, { maxHttpBufferSize: 2e6 });

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

// In production the server also hosts the built client.
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
}

const rooms = new Map<string, Room>();

function newRoomCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function createRoom(): Room {
  const room = new Room(io, newRoomCode(), BOTS_ALLOWED, (r) => {
    r.destroy();
    rooms.delete(r.code);
    console.log(`[${r.code}] closed (empty)`);
  });
  rooms.set(room.code, room);
  return room;
}

const isJoin = (p: unknown): p is JoinPayload =>
  typeof p === 'object' && p !== null && typeof (p as JoinPayload).nickname === 'string';

function currentRoom(socket: GameSocket): { room: Room; playerId: string } | null {
  const room = rooms.get(socket.data.code ?? '');
  const playerId = socket.data.playerId;
  return room && playerId && room.players.has(playerId) ? { room, playerId } : null;
}

/** A socket belongs to at most one room/player at a time. */
function leaveCurrent(socket: GameSocket) {
  rooms.get(socket.data.code ?? '')?.detach(socket);
}

io.on('connection', (socket: GameSocket) => {
  const on = <A extends unknown[]>(fn: (ctx: { room: Room; playerId: string }, ...args: A) => void) =>
    (...args: A) => {
      const ctx = currentRoom(socket);
      if (ctx) fn(ctx, ...args);
    };

  socket.on('room:create', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!isJoin(p)) return ack({ ok: false, error: 'Pick a nickname first.' });
    leaveCurrent(socket);
    const room = createRoom();
    const player = room.addPlayer(p);
    if (typeof player === 'string') return ack({ ok: false, error: player });
    room.attach(socket, player);
    console.log(`[${room.code}] created`);
    const session: Session = { code: room.code, playerId: player.id, token: player.token };
    ack({ ok: true, session });
  });

  socket.on('room:join', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!isJoin(p) || typeof p.code !== 'string') return ack({ ok: false, error: 'Pick a nickname first.' });
    const room = rooms.get(p.code.trim().toUpperCase());
    if (!room) return ack({ ok: false, error: `No room with code ${p.code.toUpperCase()}.` });
    leaveCurrent(socket);
    const player = room.addPlayer(p);
    if (typeof player === 'string') return ack({ ok: false, error: player });
    room.attach(socket, player);
    ack({ ok: true, session: { code: room.code, playerId: player.id, token: player.token } });
  });

  socket.on('room:resume', (p, ack) => {
    if (typeof ack !== 'function') return;
    const room = rooms.get(String(p?.code ?? '').toUpperCase());
    const player = room?.findPlayer(String(p?.playerId), String(p?.token));
    if (!room || !player) return ack({ ok: false, error: 'That game is gone.' });
    leaveCurrent(socket);
    room.attach(socket, player);
    ack({ ok: true });
  });

  socket.on(
    'room:leave',
    on(({ room, playerId }) => room.removePlayer(playerId)),
  );

  socket.on(
    'host:settings',
    on(({ room, playerId }, update) => room.setSettings(playerId, update)),
  );
  socket.on('host:start', (ack) => {
    if (typeof ack !== 'function') return;
    const ctx = currentRoom(socket);
    if (!ctx) return ack({ ok: false, error: 'You are not in a room.' });
    const error = ctx.room.start(ctx.playerId);
    ack(error ? { ok: false, error } : { ok: true });
  });
  socket.on(
    'host:kick',
    on(({ room, playerId }, p) => room.kick(playerId, String(p?.playerId))),
  );
  socket.on(
    'host:skip',
    on(({ room, playerId }) => room.skip(playerId)),
  );
  socket.on(
    'host:reveal',
    on(({ room, playerId }, p) => room.setReveal(playerId, Number(p?.index))),
  );
  socket.on(
    'host:lobby',
    on(({ room, playerId }) => room.backToLobby(playerId)),
  );
  socket.on(
    'host:addBot',
    on(({ room, playerId }) => room.addBot(playerId)),
  );

  socket.on(
    'turn:draft',
    on(({ room, playerId }, p) => room.draft(playerId, p?.frame, p?.word)),
  );
  socket.on(
    'turn:submit',
    on(({ room, playerId }, p) => room.submit(playerId, p?.frame, p?.word)),
  );

  socket.on('disconnect', () => leaveCurrent(socket));
});

httpServer.listen(PORT, () => {
  console.log(`${APP_NAME} server listening on http://localhost:${PORT}${BOTS_ALLOWED ? ' (bots enabled)' : ''}`);
});
