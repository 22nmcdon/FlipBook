import { useEffect, useRef } from 'react';
import type { Frame } from '@flipbook/shared';
import { renderFrame } from './render';
import { useSquareCanvas } from './useSquareCanvas';

/** A read-only square canvas showing one frame. Sized by its container's width. */
export function FrameCanvas({ frame, className }: { frame: Frame | null; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = useSquareCanvas(wrap, [canvas]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || width === 0) return;
    renderFrame(ctx, frame ?? { strokes: [] }, width);
  }, [frame, width]);

  return (
    <div ref={wrap} className={`frame-canvas ${className ?? ''}`}>
      <canvas ref={canvas} />
    </div>
  );
}
