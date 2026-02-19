import { useRef, useCallback } from 'react';

interface PaneDividerProps {
  orientation: 'horizontal' | 'vertical';
  onResize: (deltaPixels: number) => void;
}

export default function PaneDivider({ orientation, onResize }: PaneDividerProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const delta = orientation === 'horizontal' ? e.movementY : e.movementX;
      onResize(delta);
    },
    [orientation, onResize],
  );

  const stopDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={`shrink-0 bg-white/[0.06] z-[2] hover:bg-[#007acc] ${
        isHorizontal ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onLostPointerCapture={stopDrag}
      role="separator"
      aria-orientation={orientation}
    />
  );
}
