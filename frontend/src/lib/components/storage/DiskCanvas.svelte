<script lang="ts">
	import { storageState } from '$lib/stores/storage.svelte.js';
	import { pageTypeName, formatHex } from '$lib/wasm/storage-types.js';

	let canvas: HTMLCanvasElement;
	let width = $state(0);
	let viewportHeight = $state(0);
	let container: HTMLDivElement;

	const MONO = "'SF Mono','Cascadia Code','Fira Code',Consolas,monospace";
	const CELL_W = 44;
	const CELL_H = 36;
	const GAP = 3;
	const PAD = 12;
	const HEADER_H = 24;

	let canvasHeight = $derived.by(() => {
		const disk = storageState.diskSnapshot;
		if (!disk || width === 0) return viewportHeight;
		const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CELL_W + GAP)));
		const rows = Math.ceil(disk.maxPages / cols);
		const contentH = HEADER_H + PAD + rows * (CELL_H + GAP) + PAD;
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
		storageState.diskSnapshot;
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

		const disk = storageState.diskSnapshot;
		if (!disk) {
			ctx.fillStyle = 'rgba(255,255,255,0.3)';
			ctx.font = `12px ${MONO}`;
			ctx.textAlign = 'center';
			ctx.fillText('Initialize engine to see disk', width / 2, viewportHeight / 2);
			return;
		}

		// Header
		ctx.fillStyle = 'rgba(255,255,255,0.6)';
		ctx.font = `bold 11px ${MONO}`;
		ctx.textAlign = 'left';
		ctx.fillText(`DISK  ${disk.numAllocated}/${disk.maxPages} pages`, PAD, PAD + 10);

		// Pages grid
		const startY = HEADER_H + PAD;
		const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CELL_W + GAP)));

		// Which pages are in the buffer pool?
		const inPool = new Set<number>();
		const bp = storageState.bpSnapshot;
		if (bp) {
			for (const [pid] of bp.pageTable) {
				inPool.add(pid);
			}
		}

		for (let i = 0; i < disk.maxPages; i++) {
			const pg = disk.pages[i];
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
					case 0: // Data
						bg = 'rgba(96,165,250,0.1)';
						border = 'rgba(96,165,250,0.25)';
						label = 'data';
						labelColor = 'rgba(96,165,250,0.6)';
						break;
					case 1: // Overflow
						bg = 'rgba(251,191,36,0.1)';
						border = 'rgba(251,191,36,0.25)';
						label = 'ovfl';
						labelColor = 'rgba(251,191,36,0.6)';
						break;
					default:
						label = 'free';
				}
			}

			// Highlight if in buffer pool
			if (inPool.has(i)) {
				border = 'rgba(74,222,128,0.5)';
			}

			// Highlight selected
			if (i === storageState.selectedPageId) {
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

			// Page number
			ctx.fillStyle = pg.isAllocated ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)';
			ctx.font = `bold 10px ${MONO}`;
			ctx.textAlign = 'center';
			ctx.fillText(`${i}`, x + CELL_W / 2, y + 14);

			// Type label
			if (label) {
				ctx.fillStyle = labelColor;
				ctx.font = `8px ${MONO}`;
				ctx.fillText(label, x + CELL_W / 2, y + 26);
			}

			// Cached indicator (small dot)
			if (inPool.has(i)) {
				ctx.beginPath();
				ctx.arc(x + CELL_W - 5, y + 5, 2.5, 0, Math.PI * 2);
				ctx.fillStyle = '#4ade80';
				ctx.fill();
			}
		}
	}

	function handleClick(e: MouseEvent) {
		const disk = storageState.diskSnapshot;
		if (!disk) return;

		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		const startY = HEADER_H + PAD;
		const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CELL_W + GAP)));

		for (let i = 0; i < disk.maxPages; i++) {
			if (!disk.pages[i].isAllocated) continue;

			const col = i % cols;
			const row = Math.floor(i / cols);
			const x = PAD + col * (CELL_W + GAP);
			const y = startY + row * (CELL_H + GAP);

			if (mx >= x && mx <= x + CELL_W && my >= y && my <= y + CELL_H) {
				storageState.selectPage(storageState.selectedPageId === i ? null : i);
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
	canvas { display: block; cursor: pointer; }
</style>
