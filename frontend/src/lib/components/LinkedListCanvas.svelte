<script lang="ts">
	import type { LinkedListSnapshot, TraversalStep } from '$lib/wasm/types.js';
	import { StepAction } from '$lib/wasm/types.js';

	interface Props {
		snapshot: LinkedListSnapshot;
		animatingSteps: TraversalStep[];
		activeStepIndex: number;
	}

	let { snapshot, animatingSteps, activeStepIndex }: Props = $props();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let viewW = $state(900);
	let viewH = $state(400);

	// Layout
	const NODE_W = 72;
	const NODE_H = 32;
	const GAP = 28;
	const ARROW_SIZE = 6;
	const PAD_X = 48;
	const PAD_Y = 48;
	const ROW_H = NODE_H + GAP + 16;
	const DOT_TILE = 24;
	const CULL_MARGIN = ROW_H * 2;

	// Fonts
	const FONT = '12px "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace';
	const FONT_SM = '10px "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace';

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

	// --- Layout (derived, recomputed only on snapshot/width change) ---
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
		const nodesPerRow = Math.max(1, Math.floor((viewW - PAD_X * 2 + GAP) / (NODE_W + GAP)));
		const totalRows = nodes.length > 0 ? Math.ceil(nodes.length / nodesPerRow) : 0;
		const totalH = totalRows * ROW_H + PAD_Y * 2;
		const positions: NodePos[] = new Array(nodes.length);

		for (let i = 0; i < nodes.length; i++) {
			const row = (i / nodesPerRow) | 0;
			const colInRow = i % nodesPerRow;
			const reversed = (row & 1) === 1;
			const col = reversed ? (nodesPerRow - 1 - colInRow) : colInRow;
			positions[i] = {
				x: PAD_X + col * (NODE_W + GAP),
				y: PAD_Y + row * ROW_H,
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

		const { positions, totalH } = layout;
		const scrollY = container.scrollTop;
		const dpr = window.devicePixelRatio || 1;

		// Canvas is always viewport-sized (never the full content height)
		const cw = (viewW * dpr) | 0;
		const ch = (viewH * dpr) | 0;
		if (canvas.width !== cw || canvas.height !== ch) {
			canvas.width = cw;
			canvas.height = ch;
		}

		// Translate so we draw in "world" coordinates, offset by scroll
		ctx.setTransform(dpr, 0, 0, dpr, 0, -scrollY * dpr);

		// Background + dot grid (cover the visible viewport in world coords)
		const pat = getDotPattern(ctx, dpr);
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = pat;
		ctx.fillRect(0, 0, viewW, viewH);
		ctx.restore();
		// Re-apply world transform after background
		ctx.setTransform(dpr, 0, 0, dpr, 0, -scrollY * dpr);

		if (positions.length === 0) {
			ctx.fillStyle = C.dimText;
			ctx.font = '13px Inter, system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('empty list', viewW / 2, scrollY + viewH / 2);
			return;
		}

		// Cull bounds (in world coordinates)
		const cullTop = scrollY - CULL_MARGIN;
		const cullBottom = scrollY + viewH + CULL_MARGIN;

		// Find visible row range for fast skipping
		const firstVisRow = Math.max(0, Math.floor((cullTop - PAD_Y) / ROW_H));
		const lastVisRow = Math.ceil((cullBottom - PAD_Y) / ROW_H);
		const { nodesPerRow } = layout;
		const iStart = Math.max(0, firstVisRow * nodesPerRow);
		const iEnd = Math.min(positions.length, (lastVisRow + 1) * nodesPerRow);

		const stepMap = buildStepMap(animatingSteps, activeStepIndex);

		// --- Connectors ---
		ctx.lineWidth = 1.5;
		for (let i = Math.max(0, iStart - 1); i < iEnd && i < positions.length - 1; i++) {
			const p = positions[i];
			const np = positions[i + 1];
			if (p.y + NODE_H < cullTop && np.y + NODE_H < cullTop) continue;
			if (p.y > cullBottom && np.y > cullBottom) continue;

			const colors = stepMap.get(p.arenaIndex);
			ctx.strokeStyle = colors ? colors.border : C.connector;

			if (np.row === p.row) {
				const fromX = p.reversed ? p.x : p.x + NODE_W;
				const toX = p.reversed ? np.x + NODE_W : np.x;
				const midY = p.y + NODE_H / 2;
				ctx.beginPath();
				ctx.moveTo(fromX, midY);
				ctx.lineTo(toX, midY);
				ctx.stroke();
				drawArrowHead(ctx, toX, midY, p.reversed ? Math.PI : 0);
			} else {
				const fromX = p.x + NODE_W / 2;
				const fromY = p.y + NODE_H;
				const toX = np.x + NODE_W / 2;
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
				const endX = last.reversed ? last.x : last.x + NODE_W;
				const midY = last.y + NODE_H / 2;
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
				ctx.font = FONT_SM;
				ctx.textAlign = last.reversed ? 'right' : 'left';
				ctx.textBaseline = 'middle';
				ctx.fillText('null', nullX + dir * 5, midY);
			}
		}

		// --- Nodes ---
		for (let i = iStart; i < iEnd; i++) {
			const p = positions[i];
			const colors = stepMap.get(p.arenaIndex);

			ctx.fillStyle = colors ? colors.bg : C.nodeBg;
			ctx.strokeStyle = colors ? colors.border : C.nodeBorder;
			ctx.lineWidth = colors ? 1.5 : 1;
			roundRect(ctx, p.x, p.y, NODE_W, NODE_H, 8);
			ctx.stroke();

			ctx.fillStyle = colors ? colors.text : C.nodeText;
			ctx.font = FONT;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(p.value), p.x + NODE_W / 2, p.y + NODE_H / 2 - 1);
		}

		// --- Index labels (batched) ---
		ctx.fillStyle = C.indexText;
		ctx.font = FONT_SM;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'top';
		for (let i = iStart; i < iEnd; i++) {
			const p = positions[i];
			ctx.fillText(String(p.arenaIndex), p.x + NODE_W - 4, p.y + NODE_H + 2);
		}

		// HEAD badge
		if (positions.length > 0 && positions[0].y + NODE_H >= cullTop && positions[0].y <= cullBottom) {
			ctx.fillStyle = C.headBadge;
			ctx.font = FONT_SM;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			ctx.fillText('HEAD', positions[0].x + NODE_W / 2, positions[0].y - 4);
		}

		// Stats overlay (fixed to viewport bottom-left, not world coords)
		ctx.save();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = 'rgba(26, 26, 26, 0.85)';
		ctx.fillRect(0, viewH - 24, 220, 24);
		ctx.fillStyle = C.dimText;
		ctx.font = FONT_SM;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		ctx.fillText(`${snapshot.length} nodes · ${snapshot.arena.length} arena slots`, 12, viewH - 8);
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

	// Reactive draw triggers
	$effect(() => {
		snapshot;
		activeStepIndex;
		viewW;
		viewH;
		requestDraw();
	});

	// Scroll → redraw
	$effect(() => {
		if (!container) return;
		const onScroll = () => requestDraw();
		container.addEventListener('scroll', onScroll, { passive: true });
		return () => container.removeEventListener('scroll', onScroll);
	});

	// Resize observer
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
		<canvas bind:this={canvas} class="viewport-canvas" style="width: {viewW}px; height: {viewH}px;"></canvas>
	</div>
</div>

<style>
	.canvas-wrap {
		width: 100%;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
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
	}
</style>
