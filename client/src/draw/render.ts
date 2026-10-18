import type { Frame, Stroke } from '@flipbook/shared';

export const PAPER = '#ffffff';

/** Draw one stroke onto a transparent layer whose width is `w` pixels (layers are square). */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number) {
  const pts = stroke.points;
  if (pts.length === 0) return;
  const width = Math.max(1, stroke.size * w);
  ctx.save();
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = stroke.erase ? '#000' : stroke.color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const first = pts[0]!;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(first[0] * w, first[1] * w, width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Quadratic curves through the midpoints smooth out the simplified polyline.
    ctx.beginPath();
    ctx.moveTo(first[0] * w, first[1] * w);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const next = pts[i + 1]!;
      ctx.quadraticCurveTo(p[0] * w, p[1] * w, ((p[0] + next[0]) / 2) * w, ((p[1] + next[1]) / 2) * w);
    }
    const last = pts[pts.length - 1]!;
    ctx.lineTo(last[0] * w, last[1] * w);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], w: number) {
  for (const s of strokes) drawStroke(ctx, s, w);
}

let scratch: HTMLCanvasElement | null = null;

/** A shared offscreen layer, so eraser strokes only cut through their own frame. */
function scratchLayer(w: number): CanvasRenderingContext2D {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== w) {
    scratch.width = w;
    scratch.height = w;
  }
  const ctx = scratch.getContext('2d')!;
  ctx.clearRect(0, 0, w, w);
  return ctx;
}

/** Composite a frame's strokes onto `ctx` at the given opacity. */
export function drawFrameLayer(ctx: CanvasRenderingContext2D, frame: Frame, w: number, alpha = 1) {
  const layer = scratchLayer(w);
  drawStrokes(layer, frame.strokes, w);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

/** Paper plus the frame, as it appears in playback. */
export function renderFrame(ctx: CanvasRenderingContext2D, frame: Frame, w: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, w);
  drawFrameLayer(ctx, frame, w);
}
