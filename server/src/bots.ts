import { BRUSH_SIZES, cloneFrame, FALLBACK_WORDS, PALETTE, pick, type Frame, type Point, type TurnView } from '@flipbook/shared';

// Dev-only bots so one person can test a full game. They draw a blob on frame 1,
// then nudge the previous frame along a small orbit so the reveal actually animates.

export function botWord(): string {
  return pick(FALLBACK_WORDS, Math.random);
}

export function botFrame(turn: TurnView): Frame {
  const prev = turn.prevFrames.at(-1);
  if (!prev) return firstFrame();
  // Occasionally "time out" so the hold-frame path gets exercised.
  if (Math.random() < 0.1) return { strokes: [] };

  const frame = cloneFrame(prev);
  const angle = turn.frameNumber * 0.8;
  const dx = Math.cos(angle) * 0.03;
  const dy = Math.sin(angle) * 0.03;
  for (const stroke of frame.strokes) {
    stroke.points = stroke.points.map(([x, y]) => [x + dx, y + dy] as Point);
  }
  return frame;
}

function firstFrame(): Frame {
  const cx = 0.35 + Math.random() * 0.3;
  const cy = 0.35 + Math.random() * 0.3;
  const r = 0.08 + Math.random() * 0.1;
  const circle: Point[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    circle.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const colors = PALETTE.filter((c) => c !== '#ffffff');
  return {
    strokes: [
      { color: pick(colors, Math.random), size: BRUSH_SIZES[2], points: circle },
      { color: PALETTE[0], size: BRUSH_SIZES[0], points: [[cx - r * 0.35, cy - r * 0.2]] },
      { color: PALETTE[0], size: BRUSH_SIZES[0], points: [[cx + r * 0.35, cy - r * 0.2]] },
      { color: PALETTE[0], size: BRUSH_SIZES[1], points: [[0.1, 0.9], [0.9, 0.9]] },
    ],
  };
}
