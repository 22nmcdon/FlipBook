import type { GameSettings } from './settings';

/** A point in normalized canvas space: x and y are both in 0–1. */
export type Point = [x: number, y: number];

export interface Stroke {
  /** One of PALETTE. Ignored for eraser strokes. */
  color: string;
  /** Width as a fraction of canvas width (one of BRUSH_SIZES / ERASER_SIZES). */
  size: number;
  erase?: boolean;
  points: Point[];
}

export interface Frame {
  strokes: Stroke[];
}

export type Phase = 'lobby' | 'drawing' | 'reveal';

export interface PlayerView {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
  isBot: boolean;
}

export interface RoomView {
  code: string;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerView[];
  /** 0-based drawing round. Round 0 is "secret word + frame 1". */
  round: number;
  /** Server timestamp (ms) when the current round ends, or null. */
  deadline: number | null;
  /** Server clock at send time, for computing the client's clock offset. */
  serverNow: number;
  /** Players with a turn this round, and which of them are done. */
  progress: { assigned: string[]; submitted: string[] };
  /** Which chain the reveal is showing (host-controlled). */
  revealIndex: number;
  botsAllowed: boolean;
}

/** What a single player sees during a drawing round. Never includes the secret word of another chain. */
export interface TurnView {
  round: number;
  isFirst: boolean;
  /** 1-based frame number being drawn, e.g. "Frame 7 of 20". */
  frameNumber: number;
  totalFrames: number;
  /** Onion-skin frames, oldest first (1 frame, or 2 in easy mode). Empty on frame 1. */
  prevFrames: Frame[];
  deadline: number;
  /** Server-held draft, so a refresh restores in-progress work. */
  draft: Frame | null;
  draftWord: string;
  submitted: boolean;
}

export interface RevealFrame {
  authorId: string;
  authorName: string;
  authorColor: string;
  frame: Frame;
  /** True when the frame was a timed-out/blank turn filled with a copy of the previous frame. */
  held: boolean;
}

export interface RevealChain {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  word: string;
  frames: RevealFrame[];
}

export interface RevealView {
  chains: RevealChain[];
}
