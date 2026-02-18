<script lang="ts">
	import { storageState } from '$lib/stores/storage.svelte.js';

	let canvas: HTMLCanvasElement;
	let width = $state(0);
	let viewportHeight = $state(0);
	let container: HTMLDivElement;

	const MONO = "'SF Mono','Cascadia Code','Fira Code',Consolas,monospace";
	const FRAME_W = 90;
	const FRAME_H = 72;
	const FRAME_GAP = 6;
	const HEADER_H = 24;
	const STATS_H = 36;
	const PAD = 12;

	let canvasHeight = $derived.by(() => {
		const snap = storageState.bpSnapshot;
		if (!snap || width === 0) return viewportHeight;
		const cols = Math.max(1, Math.floor((width - PAD * 2 + FRAME_GAP) / (FRAME_W + FRAME_GAP)));
		const rows = Math.ceil(snap.frames.length / cols);
		const contentH = HEADER_H + PAD + rows * (FRAME_H + FRAME_GAP) + STATS_H + PAD;
		return Math.max(viewportHeight, contentH);
	});

	let rafId = 0;
	function scheduleRender() {
		if (rafId) return;
		rafId = requestAnimationFrame(() => { rafId = 0; render(); });
	}

	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0].contentRect;
			width = r.width;
			viewportHeight = r.height;
			scheduleRender();
		});
		ro.observe(container);
		return () => ro.disconnect();
	});

	$effect(() => {
		storageState.bpSnapshot;
		storageState.selectedPageId;
		canvasHeight;
		scheduleRender();
	});

	function render() {
		if (!canvas || width === 0) return;
		const dpr = window.devicePixelRatio || 1;
		const h = canvasHeight;
		canvas.width = width * dpr;
		canvas.height = h * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, width, h);

		const snap = storageState.bpSnapshot;
		if (!snap) {
			ctx.fillStyle = 'rgba(255,255,255,0.3)';
			ctx.font = `12px ${MONO}`;
			ctx.textAlign = 'center';
			ctx.fillText('Initialize engine to see buffer pool', width / 2, viewportHeight / 2);
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

		for (let i = 0; i < snap.frames.length; i++) {
			const frame = snap.frames[i];
			const col = i % cols;
			const row = Math.floor(i / cols);
			const x = PAD + col * (FRAME_W + FRAME_GAP);
			const y = startY + row * (FRAME_H + FRAME_GAP);

			// Background
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

			// Highlight if this frame holds the selected page
			if (frame.pageId !== null && frame.pageId === storageState.selectedPageId) {
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
				// Page ID
				ctx.fillStyle = '#fff';
				ctx.font = `bold 12px ${MONO}`;
				ctx.textAlign = 'center';
				ctx.fillText(`Pg ${frame.pageId}`, x + FRAME_W / 2, y + 30);

				// Pin count
				ctx.font = `9px ${MONO}`;
				ctx.fillStyle = frame.pinCount > 0 ? '#60a5fa' : 'rgba(255,255,255,0.4)';
				ctx.textAlign = 'left';
				ctx.fillText(`pin:${frame.pinCount}`, x + 4, y + 46);

				// Dirty flag
				ctx.textAlign = 'right';
				ctx.fillStyle = frame.isDirty ? '#f87171' : 'rgba(255,255,255,0.3)';
				ctx.fillText(frame.isDirty ? 'dirty' : 'clean', x + FRAME_W - 4, y + 46);

				// LRU position
				const lruPos = snap.lruOrder.indexOf(i);
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

		// Stats at bottom of content
		const statsY = h - STATS_H;
		ctx.fillStyle = 'rgba(255,255,255,0.04)';
		ctx.fillRect(0, statsY, width, STATS_H);

		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.font = `10px ${MONO}`;
		ctx.textAlign = 'left';

		const total = snap.hitCount + snap.missCount;
		const hitRate = total > 0 ? ((snap.hitCount / total) * 100).toFixed(1) : '0.0';

		ctx.fillText(`Hits: ${snap.hitCount}  Misses: ${snap.missCount}  Rate: ${hitRate}%`, PAD, statsY + 13);
		ctx.fillText(`Disk I/O  R: ${snap.diskReadCount}  W: ${snap.diskWriteCount}`, PAD, statsY + 26);
	}

	function handleClick(e: MouseEvent) {
		const snap = storageState.bpSnapshot;
		if (!snap) return;

		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		const startY = HEADER_H + PAD;
		const cols = Math.max(1, Math.floor((width - PAD * 2 + FRAME_GAP) / (FRAME_W + FRAME_GAP)));

		for (let i = 0; i < snap.frames.length; i++) {
			const frame = snap.frames[i];
			if (!frame.isOccupied || frame.pageId === null) continue;

			const col = i % cols;
			const row = Math.floor(i / cols);
			const x = PAD + col * (FRAME_W + FRAME_GAP);
			const y = startY + row * (FRAME_H + FRAME_GAP);

			if (mx >= x && mx <= x + FRAME_W && my >= y && my <= y + FRAME_H) {
				storageState.selectPage(
					storageState.selectedPageId === frame.pageId ? null : frame.pageId
				);
				return;
			}
		}
	}
</script>

<div class="canvas-viewport" bind:this={container}>
	<canvas bind:this={canvas} style="width:{width}px;height:{canvasHeight}px" onclick={handleClick}></canvas>
</div>

<style>
	.canvas-viewport {
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
	}
	canvas {
		display: block;
		cursor: pointer;
	}
</style>
