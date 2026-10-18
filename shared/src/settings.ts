export type GameMode = 'relay';

export interface GameSettings {
  mode: GameMode;
  /** Total frames in every chain, including the owner's first frame. */
  frameCount: number;
  /** Timer for round 0 (secret word + frame 1). */
  firstFrameSeconds: number;
  /** Timer for every later frame. */
  frameSeconds: number;
  /** Show the last 2 frames as onion skin instead of 1. */
  easyMode: boolean;
  /** Playback speed in the reveal and exported GIFs. */
  fps: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'relay',
  frameCount: 20,
  firstFrameSeconds: 90,
  frameSeconds: 45,
  easyMode: false,
  fps: 8,
};

export const SETTINGS_LIMITS = {
  frameCount: [6, 40],
  firstFrameSeconds: [20, 300],
  frameSeconds: [10, 180],
  fps: [4, 16],
} as const satisfies Record<string, readonly [number, number]>;

export const PRESETS = {
  quick: { frameCount: 12, firstFrameSeconds: 60, frameSeconds: 30 },
  standard: { frameCount: 20, firstFrameSeconds: 90, frameSeconds: 45 },
  chill: { frameCount: 24, firstFrameSeconds: 120, frameSeconds: 75 },
} as const satisfies Record<string, Partial<GameSettings>>;

export type PresetName = keyof typeof PRESETS;

function clampInt(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Merge an untrusted partial update into the current settings. */
export function sanitizeSettings(update: unknown, current: GameSettings): GameSettings {
  const u = (typeof update === 'object' && update !== null ? update : {}) as Record<string, unknown>;
  return {
    mode: 'relay',
    frameCount: clampInt(u.frameCount ?? current.frameCount, SETTINGS_LIMITS.frameCount, current.frameCount),
    firstFrameSeconds: clampInt(
      u.firstFrameSeconds ?? current.firstFrameSeconds,
      SETTINGS_LIMITS.firstFrameSeconds,
      current.firstFrameSeconds,
    ),
    frameSeconds: clampInt(u.frameSeconds ?? current.frameSeconds, SETTINGS_LIMITS.frameSeconds, current.frameSeconds),
    easyMode: typeof u.easyMode === 'boolean' ? u.easyMode : current.easyMode,
    fps: clampInt(u.fps ?? current.fps, SETTINGS_LIMITS.fps, current.fps),
  };
}
