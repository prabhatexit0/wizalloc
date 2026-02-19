import { useCallback, useState } from 'react';
import { useStorageStore } from '@/stores/storage';
import { useCanvas, MONO, PAD } from '@/hooks/useCanvas';
import { pageTypeName, INVALID_PAGE } from '@/wasm/storage-types';
import type { PageSnapshot } from '@/wasm/storage-types';

const BYTE_W = 18;
const BYTE_H = 16;
const BYTE_GAP = 1;

function computeSlotsHeight(snap: PageSnapshot, width: number): number {
  const sw = 70;
  const sh = 16;
  let slotX = PAD;
  let rows = 1;
  for (let i = 0; i < snap.slots.length; i++) {
    slotX += sw + 3;
    if (slotX + sw > width - PAD && i < snap.slots.length - 1) {
      slotX = PAD;
      rows++;
    }
  }
  return rows * (sh + 3);
}

function renderBarView(
  ctx: CanvasRenderingContext2D,
  snap: PageSnapshot,
  slotsEndY: number,
  width: number,
  selectedSlotId: number | null,
) {
  const barY = slotsEndY + 12;
  const barH = 28;
  const barW = width - PAD * 2;
  const ps = snap.pageSize;

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(PAD, barY, barW, barH, 4);
  ctx.fill();
  ctx.stroke();

  const scale = barW / ps;

  const headerW = 16 * scale;
  ctx.fillStyle = 'rgba(96,165,250,0.3)';
  ctx.fillRect(PAD, barY, headerW, barH);

  const slotW = (snap.freeStart - 16) * scale;
  if (slotW > 0) {
    ctx.fillStyle = 'rgba(74,222,128,0.25)';
    ctx.fillRect(PAD + headerW, barY, slotW, barH);
  }

  const tupleStart = snap.freeEnd * scale;
  const tupleW = (ps - snap.freeEnd) * scale;
  if (tupleW > 0) {
    ctx.fillStyle = 'rgba(251,191,36,0.25)';
    ctx.fillRect(PAD + tupleStart, barY, tupleW, barH);
  }

  ctx.font = `8px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(96,165,250,0.8)';
  if (headerW > 20) ctx.fillText('HDR', PAD + headerW / 2, barY + barH / 2 + 3);

  ctx.fillStyle = 'rgba(74,222,128,0.8)';
  if (slotW > 24) ctx.fillText('SLOTS', PAD + headerW + slotW / 2, barY + barH / 2 + 3);

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  const freeW = (snap.freeEnd - snap.freeStart) * scale;
  if (freeW > 30) ctx.fillText(`FREE ${snap.freeSpace}B`, PAD + snap.freeStart * scale + freeW / 2, barY + barH / 2 + 3);

  ctx.fillStyle = 'rgba(251,191,36,0.8)';
  if (tupleW > 30) ctx.fillText('TUPLES', PAD + tupleStart + tupleW / 2, barY + barH / 2 + 3);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = `7px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('0', PAD, barY + barH + 10);
  ctx.textAlign = 'center';
  ctx.fillText(String(snap.freeStart), PAD + snap.freeStart * scale, barY + barH + 10);
  ctx.fillText(String(snap.freeEnd), PAD + snap.freeEnd * scale, barY + barH + 10);
  ctx.textAlign = 'right';
  ctx.fillText(String(ps), PAD + barW, barY + barH + 10);

  const legendY = barY + barH + 22;
  const legends = [
    { color: 'rgba(96,165,250,0.5)', label: 'Header' },
    { color: 'rgba(74,222,128,0.5)', label: 'Slots' },
    { color: 'rgba(255,255,255,0.1)', label: 'Free' },
    { color: 'rgba(251,191,36,0.5)', label: 'Tuples' },
  ];
  let lx = PAD;
  for (const l of legends) {
    ctx.fillStyle = l.color;
    ctx.fillRect(lx, legendY, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `8px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(l.label, lx + 11, legendY + 7);
    lx += ctx.measureText(l.label).width + 22;
  }

  if (selectedSlotId !== null && selectedSlotId < snap.slots.length) {
    const slot = snap.slots[selectedSlotId];
    if (slot.length > 0) {
      const selX = PAD + slot.offset * scale;
      const selW = slot.length * scale;
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(selX, barY, Math.max(selW, 2), barH, 2);
      ctx.stroke();

      const infoY = legendY + 16;
      const pct = ((slot.length / ps) * 100).toFixed(1);
      ctx.fillStyle = '#00d4ff';
      ctx.font = `9px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(
        `Row ${snap.pageId}:${selectedSlotId} → Page ${snap.pageId}, Slot [${selectedSlotId}], offset ${slot.offset}, ${slot.length} bytes (${pct}% of page)`,
        PAD,
        infoY,
      );
    }
  }
}

function renderHexView(
  ctx: CanvasRenderingContext2D,
  snap: PageSnapshot,
  slotsEndY: number,
  width: number,
) {
  const hexY = slotsEndY + 12;
  const bytes = snap.rawBytes;
  const bytesPerRow = Math.max(1, Math.floor((width - PAD * 2 - 50) / (BYTE_W + BYTE_GAP)));
  const totalRows = Math.ceil(bytes.length / bytesPerRow);

  for (let row = 0; row < totalRows; row++) {
    const baseOffset = row * bytesPerRow;
    if (baseOffset >= bytes.length) break;

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `9px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(
      baseOffset.toString(16).padStart(4, '0'),
      PAD + 34,
      hexY + row * (BYTE_H + BYTE_GAP) + 11,
    );

    for (let col = 0; col < bytesPerRow; col++) {
      const byteIdx = baseOffset + col;
      if (byteIdx >= bytes.length) break;

      const bx = PAD + 40 + col * (BYTE_W + BYTE_GAP);
      const by = hexY + row * (BYTE_H + BYTE_GAP);

      let bg: string;
      if (byteIdx < 16) {
        bg = 'rgba(96,165,250,0.15)';
      } else if (byteIdx < snap.freeStart) {
        bg = 'rgba(74,222,128,0.12)';
      } else if (byteIdx >= snap.freeEnd) {
        bg = 'rgba(251,191,36,0.12)';
      } else {
        bg = 'rgba(255,255,255,0.02)';
      }

      ctx.fillStyle = bg;
      ctx.fillRect(bx, by, BYTE_W, BYTE_H);

      const val = bytes[byteIdx];
      ctx.fillStyle = val === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
      ctx.font = `9px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(val.toString(16).padStart(2, '0'), bx + BYTE_W / 2, by + 11);
    }
  }
}

export default function PageInspectorCanvas() {
  const pageSnapshot = useStorageStore((s) => s.pageSnapshot);
  const selectedSlotId = useStorageStore((s) => s.selectedSlotId);
  const selectedPageId = useStorageStore((s) => s.selectedPageId);
  const flushPage = useStorageStore((s) => s.flushPage);
  const [showHex, setShowHex] = useState(false);

  const computeHeight = useCallback(
    (width: number, viewportHeight: number) => {
      if (!pageSnapshot || width === 0) return viewportHeight;
      const slotsH = computeSlotsHeight(pageSnapshot, width);
      const baseY = PAD + 48 + slotsH + 12;
      if (showHex) {
        const bytesPerRow = Math.max(1, Math.floor((width - PAD * 2 - 50) / (BYTE_W + BYTE_GAP)));
        const totalRows = Math.ceil(pageSnapshot.rawBytes.length / bytesPerRow);
        const contentH = baseY + totalRows * (BYTE_H + BYTE_GAP) + PAD;
        return Math.max(viewportHeight, contentH);
      }
      const contentH = baseY + 28 + 22 + 30 + PAD;
      return Math.max(viewportHeight, contentH);
    },
    [pageSnapshot, showHex],
  );

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, h: number) => {
      if (!pageSnapshot) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `12px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('Select a page from the Buffer Pool or Disk', width / 2, h / 2 - 8);
        ctx.fillText('to inspect its internal layout', width / 2, h / 2 + 8);
        return;
      }

      const snap = pageSnapshot;

      // Header info
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `bold 11px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(`PAGE ${snap.pageId}  (${pageTypeName(snap.pageType)})`, PAD, PAD + 10);

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `10px ${MONO}`;
      ctx.fillText(
        `Slots: ${snap.slotCount}  Free: ${snap.freeSpace}B  Next: ${snap.nextPageId === INVALID_PAGE ? 'NULL' : 'Pg ' + snap.nextPageId}`,
        PAD,
        PAD + 24,
      );

      // Slot table
      ctx.fillText('Slot Array:', PAD, PAD + 40);
      let slotX = PAD;
      let slotY = PAD + 48;
      const sw = 70;
      const sh = 16;
      for (let i = 0; i < snap.slots.length; i++) {
        const s = snap.slots[i];
        const isDead = s.length === 0;
        const isSelected = selectedSlotId === i;

        if (isSelected) {
          ctx.fillStyle = 'rgba(0,200,255,0.15)';
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 2;
        } else {
          ctx.fillStyle = isDead ? 'rgba(239,68,68,0.1)' : 'rgba(96,165,250,0.1)';
          ctx.strokeStyle = isDead ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.2)';
          ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.roundRect(slotX, slotY, sw, sh, 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#00d4ff' : isDead ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.6)';
        ctx.font = `9px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(
          isDead ? `[${i}] DEAD` : `[${i}] @${s.offset} ${s.length}B`,
          slotX + sw / 2,
          slotY + 11,
        );

        slotX += sw + 3;
        if (slotX + sw > width - PAD) {
          slotX = PAD;
          slotY += sh + 3;
        }
      }
      const slotsEndY = slotY + sh;

      if (showHex) {
        renderHexView(ctx, snap, slotsEndY, width);
      } else {
        renderBarView(ctx, snap, slotsEndY, width, selectedSlotId);
      }
    },
    [pageSnapshot, selectedSlotId, showHex],
  );

  const { containerRef, canvasRef, width, canvasHeight } = useCanvas({
    render,
    computeHeight,
    deps: [pageSnapshot, selectedSlotId, showHex],
  });

  return (
    <div className="w-full h-full min-h-0 flex flex-col">
      <div className="flex gap-0.5 px-2 h-7 items-center shrink-0">
        <button
          className={`px-2 py-0.5 border rounded text-[10px] font-mono cursor-pointer ${!showHex ? 'bg-white/10 text-white/80 border-white/10' : 'bg-transparent text-white/40 border-white/10'}`}
          onClick={() => setShowHex(false)}
        >
          Layout
        </button>
        <button
          className={`px-2 py-0.5 border rounded text-[10px] font-mono cursor-pointer ${showHex ? 'bg-white/10 text-white/80 border-white/10' : 'bg-transparent text-white/40 border-white/10'}`}
          onClick={() => setShowHex(true)}
        >
          Hex
        </button>
        {pageSnapshot && (
          <button
            className="ml-auto px-2 py-0.5 border rounded text-[10px] font-mono cursor-pointer border-amber-400/30 bg-amber-400/10 text-amber-400/70 hover:bg-amber-400/20"
            onClick={() => flushPage(selectedPageId!)}
          >
            Flush
          </button>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <canvas
          ref={canvasRef}
          style={{ width: `${width}px`, height: `${canvasHeight}px` }}
          className="block"
        />
      </div>
    </div>
  );
}
