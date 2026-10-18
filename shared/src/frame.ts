import {
  BRUSH_SIZES,
  ERASER_SIZES,
  MAX_POINTS_PER_FRAME,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_FRAME,
  MAX_WORD_LENGTH,
  PALETTE,
} from './constants';
import type { Frame, Point, Stroke } from './types';

const PALETTE_SET = new Set<string>(PALETTE);
const SIZE_SET = new Set<number>([...BRUSH_SIZES, ...ERASER_SIZES]);

export const emptyFrame = (): Frame => ({ strokes: [] });

export function isBlankFrame(frame: Frame | null | undefined): boolean {
  return !frame || frame.strokes.every((s) => s.erase);
}

export function cloneFrame(frame: Frame): Frame {
  return {
    strokes: frame.strokes.map((s) => ({ ...s, points: s.points.map((p) => [p[0], p[1]] as Point) })),
  };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Validate an untrusted frame from the network. Drops malformed strokes, clamps
 * coordinates into 0–1, and enforces payload caps. Returns null if the input
 * isn't frame-shaped at all.
 */
export function sanitizeFrame(input: unknown): Frame | null {
  if (typeof input !== 'object' || input === null) return null;
  const rawStrokes = (input as { strokes?: unknown }).strokes;
  if (!Array.isArray(rawStrokes)) return null;

  const strokes: Stroke[] = [];
  let totalPoints = 0;
  for (const raw of rawStrokes.slice(0, MAX_STROKES_PER_FRAME)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { color, size, erase, points } = raw as Record<string, unknown>;
    const isErase = erase === true;
    if (!isErase && (typeof color !== 'string' || !PALETTE_SET.has(color))) continue;
    if (typeof size !== 'number' || !SIZE_SET.has(size)) continue;
    if (!Array.isArray(points)) continue;

    const clean: Point[] = [];
    for (const p of points.slice(0, MAX_POINTS_PER_STROKE)) {
      if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      clean.push([round4(clamp01(p[0])), round4(clamp01(p[1]))]);
    }
    if (clean.length === 0) continue;
    if (totalPoints + clean.length > MAX_POINTS_PER_FRAME) break;
    totalPoints += clean.length;
    strokes.push(isErase ? { color: PALETTE[0], size, erase: true, points: clean } : { color: color as string, size, points: clean });
  }
  return { strokes };
}

export function sanitizeWord(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_WORD_LENGTH);
}
