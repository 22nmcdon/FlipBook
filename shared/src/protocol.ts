import type { GameSettings } from './settings';
import type { Frame, RevealView, RoomView, TurnView } from './types';

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export interface JoinPayload {
  nickname: string;
  color: string;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomView) => void;
  /** Sent at the start of every drawing round; null means "sit this round out". */
  'turn:start': (turn: TurnView | null) => void;
  'reveal:data': (reveal: RevealView) => void;
  kicked: () => void;
}

export interface ClientToServerEvents {
  'room:create': (p: JoinPayload, ack: Ack<{ session: Session }>) => void;
  'room:join': (p: JoinPayload & { code: string }, ack: Ack<{ session: Session }>) => void;
  'room:resume': (p: Session, ack: Ack) => void;
  'room:leave': () => void;

  'host:settings': (p: Partial<GameSettings>) => void;
  'host:start': (ack: Ack) => void;
  'host:kick': (p: { playerId: string }) => void;
  'host:skip': () => void;
  'host:reveal': (p: { index: number }) => void;
  'host:lobby': () => void;
  'host:addBot': () => void;

  'turn:draft': (p: { frame: Frame; word?: string }) => void;
  'turn:submit': (p: { frame: Frame; word?: string }) => void;
}
