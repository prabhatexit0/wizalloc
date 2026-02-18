<script lang="ts">
	import type { LinkedListSnapshot, TraversalStep, ArenaSlot } from '$lib/wasm/types.js';
	import { StepAction } from '$lib/wasm/types.js';

	interface Props {
		snapshot: LinkedListSnapshot;
		animatingSteps: TraversalStep[];
		activeStepIndex: number;
		selectedIndex: number | null;
		onSelectIndex: (index: number | null) => void;
	}

	let { snapshot, animatingSteps, activeStepIndex, selectedIndex, onSelectIndex }: Props = $props();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let viewW = $state(900);
	let viewH = $state(300);

	let isMobile = $derived(viewW < 500);
	// Each slot: a cell showing [index | value | →next]
	let cellW = $derived(isMobile ? 48 : 64);
	let cellH = $derived(isMobile ? 48 : 56);
	let cellGap = $derived(isMobile ? 4 : 6);
	let padX = $derived(isMobile ? 12 : 24);
	let padY = $derived(isMobile ? 28 : 32);

	const MONO = '"SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace';

	let fontVal = $derived(isMobile
		? `bold 11px ${MONO}`
		: `bold 12px ${MONO}`);
	let fontIdx = $derived(isMobile
		? `9px ${MONO}`
		: `10px ${MONO}`);
	let fontNext = $derived(isMobile
		? `8px ${MONO}`
		: `9px ${MONO}`);

	const C = {
		bg: '#1a1a1a',
		aliveBg: 'rgba(59, 130, 246, 0.08)',
		aliveBorder: 'rgba(59, 130, 246, 0.25)',
		aliveText: '#60a5fa',
		deadBg: 'rgba(255, 255, 255, 0.02)',
		deadBorder: 'rgba(255, 255, 255, 0.06)',
		deadText: 'rgba(255, 255, 255, 0.15)',
		deadCross: 'rgba(255, 255, 255, 0.06)',
		indexText: 'rgba(255, 255, 255, 0.25)',
		nextText: 'rgba(255, 255, 255, 0.3)',
		headBadge: '#007acc',
		dimText: 'rgba(255, 255, 255, 0.4)',
		freeLabel: 'rgba(248, 113, 113, 0.4)',
	};

	const SELECTED = { bg: 'rgba(168, 85, 247, 0.18)', border: 'rgba(168, 85, 247, 0.7)', text: '#c084fc' };

	const STEP_COLORS: Record<number, { bg: string; border: string; text: string }> = {
		[StepAction.Visit]: { bg: 'rgba(250, 204, 21, 0.12)', border: 'rgba(250, 204, 21, 0.4)', text: '#fbbf24' },
		[StepAction.Insert]: { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.4)', text: '#4ade80' },
		[StepAction.Delete]: { bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.4)', text: '#f87171' },
		[StepAction.Found]: { bg: 'rgba(96, 165, 250, 0.22)', border: 'rgba(96, 165, 250, 0.7)', text: '#60a5fa' },
	};

	// --- Dot pattern (shared style with LinkedListCanvas) ---
	const DOT_TILE = 24;
	let dotPattern: CanvasPattern | null = null;
	let dotPatternDpr = 0;

	function getDotPattern(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern {
		if (dotPattern && dotPatternDpr === dpr) return dotPattern;
		const tile = document.createElement('canvas');
		tile.width = DOT_TILE * dpr;
		tile.height = DOT_TILE * dpr;
		const tc = tile.getContext('2d')!;
		tc.scale(dpr, dpr);
		tc.fillStyle = C.bg;
		tc.fillRect(0, 0, DOT_TILE, DOT_TILE);
		tc.fillStyle = 'rgba(255, 255, 255, 0.03)';
		tc.beginPath();
		tc.arc(DOT_TILE, DOT_TILE, 0.8, 0, Math.PI * 2);
		tc.fill();
		dotPattern = ctx.createPattern(tile, 'repeat')!;
		dotPatternDpr = dpr;
		return dotPattern;
	}

	function buildStepMap(steps: TraversalStep[], upTo: number) {
		const map = new Map<number, { bg: string; border: string; text: string }>();
		if (upTo < 0) return map;
		const end = Math.min(upTo, steps.length - 1);
		for (let i = 0; i <= end; i++) {
			const c = STEP_COLORS[steps[i].action];
			if (c) map.set(steps[i].index, c);
		}
		return map;
	}

	// --- Layout: grid of cells ---
	interface CellPos {
		x: number;
		y: number;
		slotIndex: number;
	}

	let gridLayout = $derived.by(() => {
		const slots = snapshot.allSlots;
		const cw = cellW, ch = cellH, g = cellGap, px = padX, py = padY;
		const colsPerRow = Math.max(1, Math.floor((viewW - px * 2 + g) / (cw + g)));
		const totalRows = slots.length > 0 ? Math.ceil(slots.length / colsPerRow) : 0;
		const totalH = totalRows * (ch + g) + py * 2;
		const cells: CellPos[] = new Array(slots.length);

		for (let i = 0; i < slots.length; i++) {
			const row = (i / colsPerRow) | 0;
			const col = i % colsPerRow;
			cells[i] = {
				x: px + col * (cw + g),
				y: py + row * (ch + g),
				slotIndex: i,
			};
		}

		return { cells, totalH, colsPerRow };
	});

	// --- RAF-guarded draw ---
	let rafId = 0;
	function requestDraw() {
		if (rafId) return;
		rafId = requestAnimationFrame(() => {
			rafId = 0;
			draw();
		});
	}

	function draw() {
		if (!canvas || !container) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const cw = cellW, ch = cellH, py = padY, g = cellGap;
		const { cells, totalH } = gridLayout;
		const slots = snapshot.allSlots;
		const scrollY = container.scrollTop;
		const dpr = window.devicePixelRatio || 1;

		const canvasW = (viewW * dpr) | 0;
		const canvasH = (viewH * dpr) | 0;
		if (canvas.width !== canvasW || canvas.height !== canvasH) {
			canvas.width = canvasW;
			canvas.height = canvasH;
		}

		ctx.setTransform(dpr, 0, 0, dpr, 0, -scrollY * dpr);

		// Background
		const pat = getDotPattern(ctx, dpr);
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = pat;
		ctx.fillRect(0, 0, viewW, viewH);
		ctx.restore();
		ctx.setTransform(dpr, 0, 0, dpr, 0, -scrollY * dpr);

		if (cells.length === 0) {
			ctx.fillStyle = C.dimText;
			ctx.font = `13px Inter, system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('empty arena', viewW / 2, scrollY + viewH / 2);
			return;
		}

		const cullMargin = (ch + g) * 2;
		const cullTop = scrollY - cullMargin;
		const cullBottom = scrollY + viewH + cullMargin;

		const stepMap = buildStepMap(animatingSteps, activeStepIndex);

		const r = isMobile ? 4 : 6;

		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];
			if (cell.y + ch < cullTop || cell.y > cullBottom) continue;

			const slot = slots[i];
			const sel = selectedIndex === i;
			const stepCol = stepMap.get(i);
			const alive = slot.alive;

			// Cell background
			let bg: string, border: string, textCol: string;
			if (sel) {
				bg = SELECTED.bg;
				border = SELECTED.border;
				textCol = SELECTED.text;
			} else if (stepCol) {
				bg = stepCol.bg;
				border = stepCol.border;
				textCol = stepCol.text;
			} else if (alive) {
				bg = C.aliveBg;
				border = C.aliveBorder;
				textCol = C.aliveText;
			} else {
				bg = C.deadBg;
				border = C.deadBorder;
				textCol = C.deadText;
			}

			ctx.fillStyle = bg;
			ctx.strokeStyle = border;
			ctx.lineWidth = sel ? 2 : 1;
			roundRect(ctx, cell.x, cell.y, cw, ch, r);
			ctx.stroke();

			// Dead slot cross-hatch
			if (!alive && !sel && !stepCol) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(cell.x, cell.y, cw, ch);
				ctx.clip();
				ctx.strokeStyle = C.deadCross;
				ctx.lineWidth = 0.5;
				for (let d = -ch; d < cw + ch; d += 8) {
					ctx.beginPath();
					ctx.moveTo(cell.x + d, cell.y);
					ctx.lineTo(cell.x + d + ch, cell.y + ch);
					ctx.stroke();
				}
				ctx.restore();
			}

			// Index label (top-left)
			ctx.fillStyle = C.indexText;
			ctx.font = fontIdx;
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText(String(i), cell.x + 4, cell.y + 3);

			if (alive) {
				// Value (center)
				ctx.fillStyle = textCol;
				ctx.font = fontVal;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(String(slot.value), cell.x + cw / 2, cell.y + ch / 2 - 2);

				// Next pointer (bottom)
				ctx.fillStyle = sel ? SELECTED.text : C.nextText;
				ctx.font = fontNext;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'bottom';
				const nextLabel = slot.next === null ? '→ ∅' : `→ ${slot.next}`;
				ctx.fillText(nextLabel, cell.x + cw / 2, cell.y + ch - 3);
			} else {
				// "free" label for dead slots
				ctx.fillStyle = C.freeLabel;
				ctx.font = fontNext;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('free', cell.x + cw / 2, cell.y + ch / 2);
			}

			// HEAD badge
			if (snapshot.head === i) {
				ctx.fillStyle = C.headBadge;
				ctx.font = fontIdx;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'bottom';
				ctx.fillText('HEAD', cell.x + cw / 2, cell.y - 2);
			}
		}

		// Stats overlay
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = 'rgba(26, 26, 26, 0.85)';
		const statsW = isMobile ? 200 : 260;
		ctx.fillRect(0, viewH - 24, statsW, 24);
		ctx.fillStyle = C.dimText;
		ctx.font = fontIdx;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		const freeCount = slots.filter((s: ArenaSlot) => !s.alive).length;
		ctx.fillText(`${slots.length} slots · ${slots.length - freeCount} alive · ${freeCount} free`, 8, viewH - 8);
		ctx.restore();
	}

	function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
		ctx.fill();
	}

	function handleClick(e: MouseEvent) {
		if (!container) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top + container.scrollTop;
		const cw = cellW, ch = cellH;
		const { cells } = gridLayout;
		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];
			if (mx >= cell.x && mx <= cell.x + cw && my >= cell.y && my <= cell.y + ch) {
				const slot = snapshot.allSlots[i];
				if (slot.alive) {
					onSelectIndex(i);
				}
				return;
			}
		}
		onSelectIndex(null);
	}

	// Scroll to selected slot when it changes from the other view
	function scrollToSelected() {
		if (selectedIndex === null || !container) return;
		const { cells } = gridLayout;
		if (selectedIndex < 0 || selectedIndex >= cells.length) return;
		const cell = cells[selectedIndex];
		const ch = cellH;
		const scrollY = container.scrollTop;
		const top = cell.y;
		const bottom = cell.y + ch;

		if (top < scrollY || bottom > scrollY + viewH) {
			container.scrollTo({ top: Math.max(0, top - viewH / 3), behavior: 'smooth' });
		}
	}

	$effect(() => {
		selectedIndex;
		scrollToSelected();
	});

	$effect(() => {
		snapshot;
		activeStepIndex;
		selectedIndex;
		viewW;
		viewH;
		requestDraw();
	});

	$effect(() => {
		if (!container) return;
		const onScroll = () => requestDraw();
		container.addEventListener('scroll', onScroll, { passive: true });
		return () => container.removeEventListener('scroll', onScroll);
	});

	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				viewW = entry.contentRect.width;
				viewH = entry.contentRect.height;
			}
		});
		ro.observe(container);
		return () => ro.disconnect();
	});
</script>

<div bind:this={container} class="canvas-wrap">
	<div class="scroll-content" style="height: {gridLayout.totalH}px;">
		<canvas bind:this={canvas} class="viewport-canvas" style="width: {viewW}px; height: {viewH}px; cursor: pointer;" onclick={handleClick}></canvas>
	</div>
</div>

<style>
	.canvas-wrap {
		width: 100%;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}
	.canvas-wrap::-webkit-scrollbar {
		width: 6px;
	}
	.canvas-wrap::-webkit-scrollbar-track {
		background: transparent;
	}
	.canvas-wrap::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}
	.scroll-content {
		position: relative;
		min-height: 100%;
	}
	.viewport-canvas {
		display: block;
		position: sticky;
		top: 0;
		touch-action: pan-y;
	}
</style>
