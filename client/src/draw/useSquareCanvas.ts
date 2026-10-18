import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Keep a square canvas's backing store matched to its CSS size × devicePixelRatio.
 * Returns the backing width in pixels (0 until measured).
 */
export function useSquareCanvas(ref: RefObject<HTMLElement | null>, canvases: RefObject<HTMLCanvasElement | null>[]) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const px = Math.round(el.clientWidth * (window.devicePixelRatio || 1));
      if (px <= 0) return;
      for (const c of canvases) {
        if (c.current && c.current.width !== px) {
          c.current.width = px;
          c.current.height = px;
        }
      }
      setWidth(px);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The canvas refs are stable for the component's lifetime.
  }, [ref]);
  return width;
}
