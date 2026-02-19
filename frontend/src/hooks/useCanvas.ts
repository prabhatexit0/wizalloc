import { useRef, useEffect, useCallback, useState } from 'react';

export const MONO = "'SF Mono','Cascadia Code','Fira Code',Consolas,monospace";
export const PAD = 12;

interface UseCanvasOptions {
  render: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  computeHeight: (width: number, viewportHeight: number) => number;
  deps: unknown[];
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>, width: number) => void;
}

export function useCanvas({ render, computeHeight, deps, onClick }: UseCanvasOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafId = useRef(0);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setWidth(r.width);
      setViewportHeight(r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasHeight = width > 0 ? computeHeight(width, viewportHeight) : viewportHeight;

  // Schedule render via RAF
  const scheduleRender = useCallback(() => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const canvas = canvasRef.current;
      if (!canvas || width === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const h = canvasHeight;
      canvas.width = width * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, h);
      render(ctx, width, h);
    });
  }, [render, width, canvasHeight]);

  // Trigger render on deps change
  useEffect(() => {
    scheduleRender();
  }, [scheduleRender, ...deps]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      onClick?.(e, width);
    },
    [onClick, width],
  );

  return {
    containerRef,
    canvasRef,
    width,
    viewportHeight,
    canvasHeight,
    handleClick,
  };
}
