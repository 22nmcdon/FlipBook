import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ProfilePayload,
  RevealView,
  RoomView,
  ServerToClientEvents,
  Session,
  TurnView,
} from '@flipbook/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface GameState {
  connected: boolean;
  session: Session | null;
  room: RoomView | null;
  /** This player's turn for `turnRound`; null means sitting the round out. */
  turn: TurnView | null;
  turnRound: number;
  reveal: RevealView | null;
  /** serverNow - Date.now(), so deadlines can be shown in local time. */
  clockOffset: number;
  notice: string | null;
}

// sessionStorage is per tab, so several tabs in one browser can each be a player,
// while a refresh still rejoins the same seat.
const SESSION_KEY = 'flipbook.session';

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be unavailable (private mode); the game still works without rejoin-on-refresh.
  }
}

let state: GameState = {
  connected: false,
  session: loadSession(),
  room: null,
  turn: null,
  turnRound: -1,
  reveal: null,
  clockOffset: 0,
  notice: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<GameState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export const socket: GameSocket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', async () => {
  set({ connected: true });
  const session = state.session;
  if (!session) return;
  const res = await socket.emitWithAck('room:resume', session);
  if (!res.ok) resetToHome(res.error);
});

socket.on('disconnect', () => set({ connected: false }));

socket.on('room:state', (room) => {
  const patch: Partial<GameState> = { room, clockOffset: room.serverNow - Date.now() };
  if (room.phase === 'lobby') Object.assign(patch, { turn: null, turnRound: -1, reveal: null });
  set(patch);
});

socket.on('turn:start', (turn) => {
  set({ turn, turnRound: turn?.round ?? state.room?.round ?? -1 });
});

socket.on('reveal:data', (reveal) => set({ reveal }));

socket.on('kicked', () => resetToHome('The host removed you from the room.'));

function resetToHome(notice: string | null) {
  saveSession(null);
  set({ session: null, room: null, turn: null, turnRound: -1, reveal: null, notice });
}

function enter(session: Session) {
  saveSession(session);
  set({ session, notice: null });
  const url = new URL(window.location.href);
  url.searchParams.set('room', session.code);
  window.history.replaceState(null, '', url);
}

export const actions = {
  async create(): Promise<string | null> {
    const res = await socket.emitWithAck('room:create');
    if (!res.ok) return res.error;
    enter(res.session);
    return null;
  },
  async join(code: string): Promise<string | null> {
    const res = await socket.emitWithAck('room:join', { code });
    if (!res.ok) return res.error;
    enter(res.session);
    return null;
  },
  async setProfile(profile: ProfilePayload): Promise<string | null> {
    const res = await socket.emitWithAck('player:profile', profile);
    return res.ok ? null : res.error;
  },
  leave() {
    socket.emit('room:leave');
    resetToHome(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
  },
  dismissNotice() {
    set({ notice: null });
  },
};

export function useGame(): GameState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Current time on the server's clock. */
export function serverNow(): number {
  return Date.now() + state.clockOffset;
}
