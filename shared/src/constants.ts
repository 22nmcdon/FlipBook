// Working title. Keep every user-facing mention of the name pointing here so a
// rename is a one-line change (see "Legal and Name" in the project plan).
export const APP_NAME = 'Flipbook Phone';

/** Shared limited palette so frames by different artists read as one animation. */
export const PALETTE = [
  '#1d1d1f', // ink
  '#8e8e93', // gray
  '#ffffff', // white
  '#e5383b', // red
  '#f58a07', // orange
  '#f7c815', // yellow
  '#2bb24c', // green
  '#2f6fde', // blue
  '#8a4fd8', // purple
  '#f06fb1', // pink
  '#8b5a2b', // brown
] as const;

/** Brush widths as a fraction of the canvas width (canvas is always square). */
export const BRUSH_SIZES = [0.008, 0.018, 0.04] as const;
export const ERASER_SIZES = [0.03, 0.06, 0.12] as const;

export const AVATAR_COLORS = [
  '#e5383b',
  '#f58a07',
  '#e0b000',
  '#2bb24c',
  '#14a3a3',
  '#2f6fde',
  '#8a4fd8',
  '#f06fb1',
  '#8b5a2b',
  '#5a5a63',
] as const;

export const ROOM_CODE_LENGTH = 4;
export const MIN_PLAYERS = 3;
export const RECOMMENDED_PLAYERS = 5;
export const MAX_PLAYERS = 12;

export const MAX_NICKNAME_LENGTH = 16;
export const MAX_WORD_LENGTH = 40;

// Payload caps: keep a single frame comfortably small on the wire.
export const MAX_STROKES_PER_FRAME = 600;
export const MAX_POINTS_PER_STROKE = 1500;
export const MAX_POINTS_PER_FRAME = 25_000;

/** Ramer–Douglas–Peucker tolerance, in normalized (0–1) units. */
export const SIMPLIFY_EPSILON = 0.0012;

/** Extra time the server waits past the shown deadline so late drafts still land. */
export const DEADLINE_GRACE_MS = 750;

/** Fallback secret words when a player leaves the word blank. */
export const FALLBACK_WORDS = [
  'jumping frog',
  'rocket launch',
  'melting snowman',
  'sneezing cat',
  'bouncing ball',
  'growing flower',
  'dancing robot',
  'popcorn',
  'shooting star',
  'yawning dog',
  'windy umbrella',
  'swimming fish',
  'erupting volcano',
  'falling leaf',
  'spinning top',
  'hatching egg',
] as const;
