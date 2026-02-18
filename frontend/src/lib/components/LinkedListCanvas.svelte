<script lang="ts">
	import type { LinkedListSnapshot, TraversalStep } from '$lib/wasm/types.js';
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
	let viewH = $state(400);

	// Adaptive layout — smaller nodes on narrow screens
	let isMobile = $derived(viewW < 500);
	let nodeW = $derived(isMobile ? 56 : 72);
	let nodeH = $derived(isMobile ? 28 : 32);
	let gap = $derived(isMobile ? 18 : 28);
	let padX = $derived(isMobile ? 20 : 48);
	let padY = $derived(isMobile ? 32 : 48);
	let rowH = $derived(nodeH + gap + 16);

	const ARROW_SIZE = 6;
	const DOT_TILE = 24;

	// Fonts
	let font = $derived(isMobile
		? '11px "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace'
		: '12px "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace');
	let fontSm = $derived(isMobile
		? '9px "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace'
		: '10px "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace');

	// Colors
	const C = {
		bg: '#1a1a1a',
		nodeBg: 'rgba(59, 130, 246, 0.12)',
		nodeBorder: 'rgba(59, 130, 246, 0.35)',
		nodeText: '#60a5fa',
		indexText: 'rgba(255, 255, 255, 0.25)',
		connector: 'rgba(255, 255, 255, 0.08)',
		headBadge: '#007acc',
		nullText: 'rgba(255, 255, 255, 0.2)',
		dimText: 'rgba(255, 255, 255, 0.4)',
	};

	const SELECTED = { bg: 'rgba(168, 85, 247, 0.18)', border: 'rgba(168, 85, 247, 0.7)', text: '#c084fc' };

	const STEP_COLORS: Record<number, { bg: string; border: string; text: string }> = {
		[StepAction.Visit]: { bg: 'rgba(250, 204, 21, 0.12)', border: 'rgba(250, 204, 21, 0.4)', text: '#fbbf24' },
		[StepAction.Insert]: { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.4)', text: '#4ade80' },
		[StepAction.Delete]: { bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.4)', text: '#f87171' },
		[StepAction.Found]: { bg: 'rgba(96, 165, 250, 0.22)', border: 'rgba(96, 165, 250, 0.7)', text: '#60a5fa' },
	};

	// --- Cached dot-grid pattern ---
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

	// --- Traversal lookup ---
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

	// --- Layout ---
	interface NodePos {
		x: number;
		y: number;
		value: number;
		arenaIndex: number;
		row: number;
		reversed: boolean;
	}

	let layout = $derived.by(() => {
		const nodes = snapshot.ordered;
		const nw = nodeW, nh = nodeH, g = gap, px = padX, py = padY, rh = rowH;
		const nodesPerRow = Math.max(1, Math.floor((viewW - px * 2 + g) / (nw + g)));
		const totalRows = nodes.length > 0 ? Math.ceil(nodes.length / nodesPerRow) : 0;
		const totalH = totalRows * rh + py * 2;
		const positions: NodePos[] = new Array(nodes.length);

		for (let i = 0; i < nodes.length; i++) {
			const row = (i / nodesPerRow) | 0;
			const colInRow = i % nodesPerRow;
			const reversed = (row & 1) === 1;
			const col = reversed ? (nodesPerRow - 1 - colInRow) : colInRow;
			positions[i] = {
				x: px + col * (nw + g),
				y: py + row * rh,
				value: nodes[i].value,
				arenaIndex: nodes[i].index,
				row,
				reversed,
			};
		}

		return { positions, totalH, nodesPerRow };
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

		const nw = nodeW, nh = nodeH, py = padY, rh = rowH;
		const cullMargin = rh * 2;
		const { positions, totalH } = layout;
		const scrollY = container.scrollTop;
		const dpr = window.devicePixelRatio || 1;

		const cw = (viewW * dpr) | 0;
		const ch = (viewH * dpr) | 0;
		if (canvas.width !== cw || canvas.height !== ch) {
			canvas.width = cw;
			canvas.height = ch;
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

		if (positions.length === 0) {
			ctx.fillStyle = C.dimText;
			ctx.font = '13px Inter, system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('empty list', viewW / 2, scrollY + viewH / 2);
			return;
		}

		const cullTop = scrollY - cullMargin;
		const cullBottom = scrollY + viewH + cullMargin;

		const firstVisRow = Math.max(0, Math.floor((cullTop - py) / rh));
		const lastVisRow = Math.ceil((cullBottom - py) / rh);
		const { nodesPerRow } = layout;
		const iStart = Math.max(0, firstVisRow * nodesPerRow);
		const iEnd = Math.min(positions.length, (lastVisRow + 1) * nodesPerRow);

		const stepMap = buildStepMap(animatingSteps, activeStepIndex);

		// --- Connectors ---
		ctx.lineWidth = 1.5;
		for (let i = Math.max(0, iStart - 1); i < iEnd && i < positions.length - 1; i++) {
			const p = positions[i];
			const np = positions[i + 1];
			if (p.y + nh < cullTop && np.y + nh < cullTop) continue;
			if (p.y > cullBottom && np.y > cullBottom) continue;

			const colors = stepMap.get(p.arenaIndex);
			ctx.strokeStyle = colors ? colors.border : C.connector;

			if (np.row === p.row) {
				const fromX = p.reversed ? p.x : p.x + nw;
				const toX = p.reversed ? np.x + nw : np.x;
				const midY = p.y + nh / 2;
				ctx.beginPath();
				ctx.moveTo(fromX, midY);
				ctx.lineTo(toX, midY);
				ctx.stroke();
				drawArrowHead(ctx, toX, midY, p.reversed ? Math.PI : 0);
			} else {
				const fromX = p.x + nw / 2;
				const fromY = p.y + nh;
				const toX = np.x + nw / 2;
				const toY = np.y;
				const cpOff = (toY - fromY) * 0.4;
				ctx.beginPath();
				ctx.moveTo(fromX, fromY);
				ctx.bezierCurveTo(fromX, fromY + cpOff, toX, toY - cpOff, toX, toY);
				ctx.stroke();
				drawArrowHead(ctx, toX, toY, Math.PI / 2);
			}
		}

		// Null terminator
		if (positions.length > 0) {
			const last = positions[positions.length - 1];
			if (last.y >= cullTop && last.y <= cullBottom) {
				const endX = last.reversed ? last.x : last.x + nw;
				const midY = last.y + nh / 2;
				const dir = last.reversed ? -1 : 1;
				const nullX = endX + dir * 16;
				ctx.strokeStyle = C.connector;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(endX, midY);
				ctx.lineTo(nullX, midY);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(nullX, midY - 6);
				ctx.lineTo(nullX, midY + 6);
				ctx.stroke();
				ctx.fillStyle = C.nullText;
				ctx.font = fontSm;
				ctx.textAlign = last.reversed ? 'right' : 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText('null', nullX + dir * 5, midY);
			}
		}

		// --- Nodes ---
		for (let i = iStart; i < iEnd; i++) {
			const p = positions[i];
			const colors = stepMap.get(p.arenaIndex);
			const sel = selectedIndex === p.arenaIndex;

			ctx.fillStyle = sel ? SELECTED.bg : colors ? colors.bg : C.nodeBg;
			ctx.strokeStyle = sel ? SELECTED.border : colors ? colors.border : C.nodeBorder;
			ctx.lineWidth = sel ? 2 : colors ? 1.5 : 1;
			roundRect(ctx, p.x, p.y, nw, nh, isMobile ? 6 : 8);
			ctx.stroke();

			ctx.fillStyle = sel ? SELECTED.text : colors ? colors.text : C.nodeText;
			ctx.font = font;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(p.value), p.x + nw / 2, p.y + nh / 2 - 1);
		}

		// --- Index labels ---
		if (!isMobile) {
			ctx.fillStyle = C.indexText;
			ctx.font = fontSm;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'top';
			for (let i = iStart; i < iEnd; i++) {
				const p = positions[i];
				ctx.fillText(String(p.arenaIndex), p.x + nw - 4, p.y + nh + 2);
			}
		}

		// HEAD badge
		if (positions.length > 0 && positions[0].y + nh >= cullTop && positions[0].y <= cullBottom) {
			ctx.fillStyle = C.headBadge;
			ctx.font = fontSm;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			ctx.fillText('HEAD', positions[0].x + nw / 2, positions[0].y - 4);
		}

		// Stats overlay
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = 'rgba(26, 26, 26, 0.85)';
		const statsW = isMobile ? 170 : 220;
		ctx.fillRect(0, viewH - 24, statsW, 24);
		ctx.fillStyle = C.dimText;
		ctx.font = fontSm;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		ctx.fillText(`${snapshot.length} nodes · ${snapshot.arena.length} slots`, 8, viewH - 8);
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

	function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x - ARROW_SIZE * Math.cos(angle - Math.PI / 6), y - ARROW_SIZE * Math.sin(angle - Math.PI / 6));
		ctx.lineTo(x - ARROW_SIZE * Math.cos(angle + Math.PI / 6), y - ARROW_SIZE * Math.sin(angle + Math.PI / 6));
		ctx.closePath();
		ctx.fillStyle = ctx.strokeStyle as string;
		ctx.fill();
	}

	function handleClick(e: MouseEvent) {
		if (!container) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top + container.scrollTop;
		const nw = nodeW, nh = nodeH;
		const { positions } = layout;
		for (let i = 0; i < positions.length; i++) {
			const p = positions[i];
			if (mx >= p.x && mx <= p.x + nw && my >= p.y && my <= p.y + nh) {
				onSelectIndex(p.arenaIndex);
				return;
			}
		}
		onSelectIndex(null);
	}

	function scrollToSelected() {
		if (selectedIndex === null || !container) return;
		const { positions } = layout;
		const nh = nodeH;
		const p = positions.find(p => p.arenaIndex === selectedIndex);
		if (!p) return;
		const scrollY = container.scrollTop;
		if (p.y < scrollY || p.y + nh > scrollY + viewH) {
			container.scrollTo({ top: Math.max(0, p.y - viewH / 3), behavior: 'smooth' });
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
	<div class="scroll-content" style="height: {layout.totalH}px;">
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
