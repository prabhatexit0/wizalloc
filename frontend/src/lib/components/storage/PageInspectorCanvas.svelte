<script lang="ts">
	import { storageState } from '$lib/stores/storage.svelte.js';
	import { pageTypeName, formatHex, INVALID_PAGE } from '$lib/wasm/storage-types.js';

	let canvas: HTMLCanvasElement;
	let width = $state(0);
	let height = $state(0);
	let container: HTMLDivElement;
	let showHex = $state(false);

	const MONO = "'SF Mono','Cascadia Code','Fira Code',Consolas,monospace";
	const PAD = 12;
	const HEADER_H = 60;
	const BYTE_W = 18;
	const BYTE_H = 16;
	const BYTE_GAP = 1;

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
			height = r.height;
			scheduleRender();
		});
		ro.observe(container);
		return () => ro.disconnect();
	});

	$effect(() => {
		storageState.pageSnapshot;
		showHex;
		scheduleRender();
	});

	function render() {
		if (!canvas || width === 0) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, width, height);

		const snap = storageState.pageSnapshot;
		if (!snap) {
			ctx.fillStyle = 'rgba(255,255,255,0.3)';
			ctx.font = `12px ${MONO}`;
			ctx.textAlign = 'center';
			ctx.fillText('Click a page to inspect', width / 2, height / 2);
			return;
		}

		// Header info
		ctx.fillStyle = 'rgba(255,255,255,0.7)';
		ctx.font = `bold 11px ${MONO}`;
		ctx.textAlign = 'left';
		ctx.fillText(
			`PAGE ${snap.pageId}  (${pageTypeName(snap.pageType)})`,
			PAD, PAD + 10
		);

		ctx.fillStyle = 'rgba(255,255,255,0.45)';
		ctx.font = `10px ${MONO}`;
		ctx.fillText(
			`Slots: ${snap.slotCount}  Free: ${snap.freeSpace}B  Next: ${snap.nextPageId === INVALID_PAGE ? 'NULL' : 'Pg ' + snap.nextPageId}`,
			PAD, PAD + 24
		);

		// Slot table
		ctx.fillText('Slot Array:', PAD, PAD + 40);
		let slotX = PAD;
		const slotY = PAD + 48;
		for (let i = 0; i < snap.slots.length; i++) {
			const s = snap.slots[i];
			const isDead = s.length === 0;
			const sw = 70;
			const sh = 16;

			ctx.fillStyle = isDead ? 'rgba(239,68,68,0.1)' : 'rgba(96,165,250,0.1)';
			ctx.strokeStyle = isDead ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.2)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.roundRect(slotX, slotY, sw, sh, 2);
			ctx.fill();
			ctx.stroke();

			ctx.fillStyle = isDead ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.6)';
			ctx.font = `9px ${MONO}`;
			ctx.textAlign = 'center';
			ctx.fillText(
				isDead ? `[${i}] DEAD` : `[${i}] @${s.offset} ${s.length}B`,
				slotX + sw / 2, slotY + 11
			);

			slotX += sw + 3;
			if (slotX + sw > width - PAD) {
				slotX = PAD;
				// Can't render more rows in this simple implementation
				break;
			}
		}

		if (showHex) {
			renderHexView(ctx, snap);
		} else {
			renderBarView(ctx, snap);
		}
	}

	function renderBarView(ctx: CanvasRenderingContext2D, snap: NonNullable<typeof storageState.pageSnapshot>) {
		// Visual bar showing page layout
		const barY = HEADER_H + 20;
		const barH = 28;
		const barW = width - PAD * 2;
		const ps = snap.pageSize;

		// Background
		ctx.fillStyle = 'rgba(255,255,255,0.03)';
		ctx.strokeStyle = 'rgba(255,255,255,0.1)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(PAD, barY, barW, barH, 4);
		ctx.fill();
		ctx.stroke();

		const scale = barW / ps;

		// Header region (0..16)
		const headerW = 16 * scale;
		ctx.fillStyle = 'rgba(96,165,250,0.3)';
		ctx.fillRect(PAD, barY, headerW, barH);

		// Slot array region (16..freeStart)
		const slotW = (snap.freeStart - 16) * scale;
		if (slotW > 0) {
			ctx.fillStyle = 'rgba(74,222,128,0.25)';
			ctx.fillRect(PAD + headerW, barY, slotW, barH);
		}

		// Tuple data region (freeEnd..pageSize)
		const tupleStart = snap.freeEnd * scale;
		const tupleW = (ps - snap.freeEnd) * scale;
		if (tupleW > 0) {
			ctx.fillStyle = 'rgba(251,191,36,0.25)';
			ctx.fillRect(PAD + tupleStart, barY, tupleW, barH);
		}

		// Labels
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

		// Byte offset markers
		ctx.fillStyle = 'rgba(255,255,255,0.25)';
		ctx.font = `7px ${MONO}`;
		ctx.textAlign = 'left';
		ctx.fillText('0', PAD, barY + barH + 10);
		ctx.textAlign = 'center';
		ctx.fillText(String(snap.freeStart), PAD + snap.freeStart * scale, barY + barH + 10);
		ctx.fillText(String(snap.freeEnd), PAD + snap.freeEnd * scale, barY + barH + 10);
		ctx.textAlign = 'right';
		ctx.fillText(String(ps), PAD + barW, barY + barH + 10);

		// Legend
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
	}

	function renderHexView(ctx: CanvasRenderingContext2D, snap: NonNullable<typeof storageState.pageSnapshot>) {
		const hexY = HEADER_H + 20;
		const bytes = snap.rawBytes;
		const bytesPerRow = Math.max(1, Math.floor((width - PAD * 2 - 50) / (BYTE_W + BYTE_GAP)));
		const maxRows = Math.floor((height - hexY - 10) / (BYTE_H + BYTE_GAP));

		for (let row = 0; row < maxRows; row++) {
			const baseOffset = row * bytesPerRow;
			if (baseOffset >= bytes.length) break;

			// Offset label
			ctx.fillStyle = 'rgba(255,255,255,0.3)';
			ctx.font = `9px ${MONO}`;
			ctx.textAlign = 'right';
			ctx.fillText(
				baseOffset.toString(16).padStart(4, '0'),
				PAD + 34, hexY + row * (BYTE_H + BYTE_GAP) + 11
			);

			for (let col = 0; col < bytesPerRow; col++) {
				const byteIdx = baseOffset + col;
				if (byteIdx >= bytes.length) break;

				const bx = PAD + 40 + col * (BYTE_W + BYTE_GAP);
				const by = hexY + row * (BYTE_H + BYTE_GAP);

				// Color by region
				let bg: string;
				if (byteIdx < 16) {
					bg = 'rgba(96,165,250,0.15)'; // header
				} else if (byteIdx < snap.freeStart) {
					bg = 'rgba(74,222,128,0.12)'; // slots
				} else if (byteIdx >= snap.freeEnd) {
					bg = 'rgba(251,191,36,0.12)'; // tuples
				} else {
					bg = 'rgba(255,255,255,0.02)'; // free
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
</script>

<div class="canvas-wrap" bind:this={container}>
	<div class="toolbar">
		<button class="toggle" class:active={!showHex} onclick={() => (showHex = false)}>Layout</button>
		<button class="toggle" class:active={showHex} onclick={() => (showHex = true)}>Hex</button>
		{#if storageState.pageSnapshot}
			<button class="flush-btn" onclick={() => storageState.flushPage(storageState.selectedPageId!)}>
				Flush
			</button>
		{/if}
	</div>
	<canvas bind:this={canvas} style="width:{width}px;height:{height - 28}px"></canvas>
</div>

<style>
	.canvas-wrap {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.toolbar {
		display: flex;
		gap: 2px;
		padding: 4px 8px;
		height: 28px;
		align-items: center;
		flex-shrink: 0;
	}
	.toggle {
		padding: 2px 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		background: transparent;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 10px;
	}
	.toggle.active {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}
	.flush-btn {
		margin-left: auto;
		padding: 2px 8px;
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 3px;
		background: rgba(251, 191, 36, 0.1);
		color: rgba(251, 191, 36, 0.7);
		cursor: pointer;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 10px;
	}
	.flush-btn:hover { background: rgba(251, 191, 36, 0.2); }
	canvas { display: block; flex: 1; min-height: 0; }
</style>
