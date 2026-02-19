import { useCallback } from 'react';
import { useStorageStore } from '@/stores/storage';
import { useCanvas, MONO, PAD } from '@/hooks/useCanvas';

const CELL_W = 44;
const CELL_H = 36;
const GAP = 3;
const HEADER_H = 24;

export default function DiskCanvas() {
  const diskSnapshot = useStorageStore((s) => s.diskSnapshot);
  const bpSnapshot = useStorageStore((s) => s.bpSnapshot);
  const selectedPageId = useStorageStore((s) => s.selectedPageId);
  const selectPage = useStorageStore((s) => s.selectPage);

  const computeHeight = useCallback(
    (width: number, viewportHeight: number) => {
      if (!diskSnapshot || width === 0) return viewportHeight;
      const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CELL_W + GAP)));
      const rows = Math.ceil(diskSnapshot.maxPages / cols);
      const contentH = HEADER_H + PAD + rows * (CELL_H + GAP) + PAD;
      return Math.max(viewportHeight, contentH);
    },
    [diskSnapshot],
  );

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, h: number) => {
      if (!diskSnapshot) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `12px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('Initialize engine to see disk', width / 2, h / 2);
        return;
      }

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `bold 11px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(`DISK  ${diskSnapshot.numAllocated}/${diskSnapshot.maxPages} pages`, PAD, PAD + 10);

      const startY = HEADER_H + PAD;
      const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CELL_W + GAP)));

      const inPool = new Set<number>();
      if (bpSnapshot) {
        for (const [pid] of bpSnapshot.pageTable) {
          inPool.add(pid);
        }
      }

      for (let i = 0; i < diskSnapshot.maxPages; i++) {
        const pg = diskSnapshot.pages[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = PAD + col * (CELL_W + GAP);
        const y = startY + row * (CELL_H + GAP);

        let bg = 'rgba(255,255,255,0.02)';
        let border = 'rgba(255,255,255,0.06)';
        let label = '';
        let labelColor = 'rgba(255,255,255,0.25)';

        if (pg.isAllocated) {
          switch (pg.pageType) {
            case 0:
              bg = 'rgba(96,165,250,0.1)';
              border = 'rgba(96,165,250,0.25)';
              label = 'data';
              labelColor = 'rgba(96,165,250,0.6)';
              break;
            case 1:
              bg = 'rgba(251,191,36,0.1)';
              border = 'rgba(251,191,36,0.25)';
              label = 'ovfl';
              labelColor = 'rgba(251,191,36,0.6)';
              break;
            default:
              label = 'free';
          }
        }

        if (inPool.has(i)) {
          border = 'rgba(74,222,128,0.5)';
        }

        if (i === selectedPageId) {
          border = '#c084fc';
          bg = 'rgba(192,132,252,0.15)';
        }

        ctx.fillStyle = bg;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, CELL_W, CELL_H, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pg.isAllocated ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)';
        ctx.font = `bold 10px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${i}`, x + CELL_W / 2, y + 14);

        if (label) {
          ctx.fillStyle = labelColor;
          ctx.font = `8px ${MONO}`;
          ctx.fillText(label, x + CELL_W / 2, y + 26);
        }

        if (inPool.has(i)) {
          ctx.beginPath();
          ctx.arc(x + CELL_W - 5, y + 5, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#4ade80';
          ctx.fill();
        }
      }
    },
    [diskSnapshot, bpSnapshot, selectedPageId],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, width: number) => {
      if (!diskSnapshot) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const startY = HEADER_H + PAD;
      const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CELL_W + GAP)));

      for (let i = 0; i < diskSnapshot.maxPages; i++) {
        if (!diskSnapshot.pages[i].isAllocated) continue;

        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = PAD + col * (CELL_W + GAP);
        const y = startY + row * (CELL_H + GAP);

        if (mx >= x && mx <= x + CELL_W && my >= y && my <= y + CELL_H) {
          selectPage(selectedPageId === i ? null : i);
          return;
        }
      }
    },
    [diskSnapshot, selectedPageId, selectPage],
  );

  const { containerRef, canvasRef, width, canvasHeight, handleClick: onCanvasClick } = useCanvas({
    render,
    computeHeight,
    deps: [diskSnapshot, bpSnapshot, selectedPageId],
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
