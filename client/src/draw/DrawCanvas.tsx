import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { SIMPLIFY_EPSILON, simplifyPoints, type Frame, type Point, type Stroke } from '@flipbook/shared';
import { drawFrameLayer, drawStroke, drawStrokes, PAPER } from './render';
import { useSquareCanvas } from './useSquareCanvas';

export interface Tool {
  color: string;
  size: number;
  erase: boolean;
}

interface Props {
  strokes: Stroke[];
  /** Previous frames for onion skinning, oldest first. */
  onion: Frame[];
  showOnion: boolean;
  tool: Tool;
  disabled?: boolean;
  onStroke: (stroke: Stroke) => void;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Two stacked canvases: paper + onion skin underneath, this frame's strokes on top.
 * Strokes are stored in normalized 0–1 coordinates so they line up on any screen.
 */
export function DrawCanvas({ strokes, onion, showOnion, tool, disabled, onStroke }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const committed = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Point[] | null>(null);
  const frameRequest = useRef(0);
  const width = useSquareCanvas(wrap, [under, over]);

  const paint = () => {
    frameRequest.current = 0;
    const ctx = over.current?.getContext('2d');
    if (!ctx || !committed.current || width === 0) return;
    ctx.clearRect(0, 0, width, width);
    ctx.drawImage(committed.current, 0, 0);
    if (live.current) drawStroke(ctx, { ...tool, points: live.current }, width);
  };
  const schedulePaint = () => {
    if (!frameRequest.current) frameRequest.current = requestAnimationFrame(paint);
  };

  // Paper and onion skin.
  useEffect(() => {
    const ctx = under.current?.getContext('2d');
    if (!ctx || width === 0) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, width);
    if (!showOnion) return;
    onion.forEach((frame, i) => drawFrameLayer(ctx, frame, width, i === onion.length - 1 ? 0.3 : 0.13));
  }, [onion, showOnion, width]);

  // Cache committed strokes so a live stroke only redraws itself.
  useEffect(() => {
    if (width === 0) return;
    committed.current ??= document.createElement('canvas');
    const c = committed.current;
    c.width = width;
    c.height = width;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, width, width);
    drawStrokes(ctx, strokes, width);
    paint();
    // paint reads the latest refs; re-running on its identity would only add redraws.
  }, [strokes, width]);

  useEffect(() => () => cancelAnimationFrame(frameRequest.current), []);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = over.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [x, y];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is only a nicety (keeps strokes going past the edge); draw without it.
    }
    live.current = [toPoint(e)];
    schedulePaint();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pts = live.current;
    if (!pts) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toPoint(ev);
      const last = pts[pts.length - 1]!;
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) > 0.0008) pts.push(p);
    }
    schedulePaint();
  };

  const finish = () => {
    const pts = live.current;
    live.current = null;
    if (!pts) return;
    const points = simplifyPoints(pts, SIMPLIFY_EPSILON).map(([x, y]) => [round4(x), round4(y)] as Point);
    onStroke(tool.erase ? { color: PAPER, size: tool.size, erase: true, points } : { color: tool.color, size: tool.size, points });
  };

  return (
    <div ref={wrap} className={`draw-canvas ${tool.erase ? 'erasing' : ''}`}>
      <canvas ref={under} />
      <canvas
        ref={over}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  );
}
