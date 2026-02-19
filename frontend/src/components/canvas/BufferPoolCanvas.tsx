import { useCallback } from 'react';
import { useStorageStore } from '@/stores/storage';
import { useCanvas, MONO, PAD } from '@/hooks/useCanvas';

const FRAME_W = 90;
const FRAME_H = 72;
const FRAME_GAP = 6;
const HEADER_H = 24;
const STATS_H = 36;

export default function BufferPoolCanvas() {
  const bpSnapshot = useStorageStore((s) => s.bpSnapshot);
  const selectedPageId = useStorageStore((s) => s.selectedPageId);
  const selectPage = useStorageStore((s) => s.selectPage);

  const computeHeight = useCallback(
    (width: number, viewportHeight: number) => {
      if (!bpSnapshot || width === 0) return viewportHeight;
      const cols = Math.max(1, Math.floor((width - PAD * 2 + FRAME_GAP) / (FRAME_W + FRAME_GAP)));
      const rows = Math.ceil(bpSnapshot.frames.length / cols);
      const contentH = HEADER_H + PAD + rows * (FRAME_H + FRAME_GAP) + STATS_H + PAD;
      return Math.max(viewportHeight, contentH);
    },
    [bpSnapshot],
  );

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, h: number) => {
      if (!bpSnapshot) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `12px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('Initialize engine to see buffer pool', width / 2, h / 2);
        return;
      }

      // Header
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `bold 11px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText('BUFFER POOL', PAD, PAD + 10);

      // Frames
      const startY = HEADER_H + PAD;
      const cols = Math.max(1, Math.floor((width - PAD * 2 + FRAME_GAP) / (FRAME_W + FRAME_GAP)));

      for (let i = 0; i < bpSnapshot.frames.length; i++) {
        const frame = bpSnapshot.frames[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = PAD + col * (FRAME_W + FRAME_GAP);
        const y = startY + row * (FRAME_H + FRAME_GAP);

        let bg = 'rgba(255,255,255,0.03)';
        let borderColor = 'rgba(255,255,255,0.1)';

        if (frame.isOccupied) {
          if (frame.isDirty) {
            bg = 'rgba(239,68,68,0.1)';
            borderColor = 'rgba(239,68,68,0.3)';
          } else {
            bg = 'rgba(74,222,128,0.08)';
            borderColor = 'rgba(74,222,128,0.2)';
          }
          if (frame.pinCount > 0) {
            borderColor = 'rgba(96,165,250,0.5)';
          }
        }

        if (frame.pageId !== null && frame.pageId === selectedPageId) {
          borderColor = '#c084fc';
          bg = 'rgba(192,132,252,0.12)';
        }

        ctx.fillStyle = bg;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, FRAME_W, FRAME_H, 4);
        ctx.fill();
        ctx.stroke();

        // Frame label
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = `9px ${MONO}`;
        ctx.textAlign = 'left';
        ctx.fillText(`Fr ${i}`, x + 4, y + 11);

        if (frame.isOccupied) {
          ctx.fillStyle = '#fff';
          ctx.font = `bold 12px ${MONO}`;
          ctx.textAlign = 'center';
          ctx.fillText(`Pg ${frame.pageId}`, x + FRAME_W / 2, y + 30);

          ctx.font = `9px ${MONO}`;
          ctx.fillStyle = frame.pinCount > 0 ? '#60a5fa' : 'rgba(255,255,255,0.4)';
          ctx.textAlign = 'left';
          ctx.fillText(`pin:${frame.pinCount}`, x + 4, y + 46);

          ctx.textAlign = 'right';
          ctx.fillStyle = frame.isDirty ? '#f87171' : 'rgba(255,255,255,0.3)';
          ctx.fillText(frame.isDirty ? 'dirty' : 'clean', x + FRAME_W - 4, y + 46);

          const lruPos = bpSnapshot.lruOrder.indexOf(i);
          if (lruPos >= 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = `8px ${MONO}`;
            ctx.textAlign = 'center';
            ctx.fillText(`LRU:${lruPos}`, x + FRAME_W / 2, y + 62);
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.font = `11px ${MONO}`;
          ctx.textAlign = 'center';
          ctx.fillText('empty', x + FRAME_W / 2, y + 35);
        }
      }

      // Stats
      const statsY = h - STATS_H;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, statsY, width, STATS_H);

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `10px ${MONO}`;
      ctx.textAlign = 'left';

      const total = bpSnapshot.hitCount + bpSnapshot.missCount;
      const hitRate = total > 0 ? ((bpSnapshot.hitCount / total) * 100).toFixed(1) : '0.0';

      ctx.fillText(`Hits: ${bpSnapshot.hitCount}  Misses: ${bpSnapshot.missCount}  Rate: ${hitRate}%`, PAD, statsY + 13);
      ctx.fillText(`Disk I/O  R: ${bpSnapshot.diskReadCount}  W: ${bpSnapshot.diskWriteCount}`, PAD, statsY + 26);
    },
    [bpSnapshot, selectedPageId],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, width: number) => {
      if (!bpSnapshot) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const startY = HEADER_H + PAD;
      const cols = Math.max(1, Math.floor((width - PAD * 2 + FRAME_GAP) / (FRAME_W + FRAME_GAP)));

      for (let i = 0; i < bpSnapshot.frames.length; i++) {
        const frame = bpSnapshot.frames[i];
        if (!frame.isOccupied || frame.pageId === null) continue;

        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = PAD + col * (FRAME_W + FRAME_GAP);
        const y = startY + row * (FRAME_H + FRAME_GAP);

        if (mx >= x && mx <= x + FRAME_W && my >= y && my <= y + FRAME_H) {
          selectPage(selectedPageId === frame.pageId ? null : frame.pageId);
          return;
        }
      }
    },
    [bpSnapshot, selectedPageId, selectPage],
  );

  const { containerRef, canvasRef, width, canvasHeight, handleClick: onCanvasClick } = useCanvas({
    render,
    computeHeight,
    deps: [bpSnapshot, selectedPageId],
    onClick: handleClick,
  });

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 overflow-y-auto overflow-x-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${canvasHeight}px` }}
        className="block cursor-pointer"
        onClick={onCanvasClick}
      />
    </div>
  );
}
