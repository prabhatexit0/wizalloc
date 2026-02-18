<script lang="ts">
	import { storageState } from '$lib/stores/storage.svelte.js';
	import { pageTypeName, formatHex, INVALID_PAGE } from '$lib/wasm/storage-types.js';

	let canvas: HTMLCanvasElement;
	let width = $state(0);
	let viewportHeight = $state(0);
	let container: HTMLDivElement;
	let showHex = $state(false);

	const MONO = "'SF Mono','Cascadia Code','Fira Code',Consolas,monospace";
	const PAD = 12;
	const HEADER_H = 60;
	const BYTE_W = 18;
	const BYTE_H = 16;
	const BYTE_GAP = 1;

	function computeSlotsHeight(snap: NonNullable<typeof storageState.pageSnapshot>): number {
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

	let canvasHeight = $derived.by(() => {
		const snap = storageState.pageSnapshot;
		if (!snap || width === 0) return viewportHeight;
		const slotsH = computeSlotsHeight(snap);
		const baseY = PAD + 48 + slotsH + 12; // after slots + gap
		if (showHex) {
			const bytesPerRow = Math.max(1, Math.floor((width - PAD * 2 - 50) / (BYTE_W + BYTE_GAP)));
			const totalRows = Math.ceil(snap.rawBytes.length / bytesPerRow);
			const contentH = baseY + totalRows * (BYTE_H + BYTE_GAP) + PAD;
			return Math.max(viewportHeight, contentH);
		}
		// Layout mode: bar + legend + row info
		const contentH = baseY + 28 + 22 + 30 + PAD;
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
		storageState.pageSnapshot;
		storageState.selectedSlotId;
		showHex;
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

		const snap = storageState.pageSnapshot;
		if (!snap) {
			ctx.fillStyle = 'rgba(255,255,255,0.3)';
			ctx.font = `12px ${MONO}`;
			ctx.textAlign = 'center';
			ctx.fillText('Select a page from the Buffer Pool or Disk', width / 2, viewportHeight / 2 - 8);
			ctx.fillText('to inspect its internal layout', width / 2, viewportHeight / 2 + 8);
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
		let slotY = PAD + 48;
		const sw = 70;
		const sh = 16;
		const selSlot = storageState.selectedSlotId;
		for (let i = 0; i < snap.slots.length; i++) {
			const s = snap.slots[i];
			const isDead = s.length === 0;
			const isSelected = selSlot === i;

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
				slotX + sw / 2, slotY + 11
			);

			slotX += sw + 3;
			if (slotX + sw > width - PAD) {
				slotX = PAD;
				slotY += sh + 3;
			}
		}
		const slotsEndY = slotY + sh;

		if (showHex) {
			renderHexView(ctx, snap, slotsEndY);
		} else {
			renderBarView(ctx, snap, slotsEndY);
		}
	}

	function renderBarView(ctx: CanvasRenderingContext2D, snap: NonNullable<typeof storageState.pageSnapshot>, slotsEndY: number) {
		// Visual bar showing page layout
		const barY = slotsEndY + 12;
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

		// Highlight selected slot's tuple byte range in the bar
		const selSlot = storageState.selectedSlotId;
		if (selSlot !== null && selSlot < snap.slots.length) {
			const slot = snap.slots[selSlot];
			if (slot.length > 0) {
				const selX = PAD + slot.offset * scale;
				const selW = slot.length * scale;
				ctx.strokeStyle = '#00d4ff';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.roundRect(selX, barY, Math.max(selW, 2), barH, 2);
				ctx.stroke();

				// Row memory footprint info line
				const infoY = legendY + 16;
				const pct = ((slot.length / ps) * 100).toFixed(1);
				ctx.fillStyle = '#00d4ff';
				ctx.font = `9px ${MONO}`;
				ctx.textAlign = 'left';
				ctx.fillText(
					`Row ${snap.pageId}:${selSlot} → Page ${snap.pageId}, Slot [${selSlot}], offset ${slot.offset}, ${slot.length} bytes (${pct}% of page)`,
					PAD, infoY
				);
			}
		}
	}

	function renderHexView(ctx: CanvasRenderingContext2D, snap: NonNullable<typeof storageState.pageSnapshot>, slotsEndY: number) {
		const hexY = slotsEndY + 12;
		const bytes = snap.rawBytes;
		const bytesPerRow = Math.max(1, Math.floor((width - PAD * 2 - 50) / (BYTE_W + BYTE_GAP)));
		const totalRows = Math.ceil(bytes.length / bytesPerRow);

		for (let row = 0; row < totalRows; row++) {
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

<div class="canvas-wrap">
	<div class="toolbar">
		<button class="toggle" class:active={!showHex} onclick={() => (showHex = false)}>Layout</button>
		<button class="toggle" class:active={showHex} onclick={() => (showHex = true)}>Hex</button>
		{#if storageState.pageSnapshot}
			<button class="flush-btn" onclick={() => storageState.flushPage(storageState.selectedPageId!)}>
				Flush
			</button>
		{/if}
	</div>
	<div class="canvas-viewport" bind:this={container}>
		<canvas bind:this={canvas} style="width:{width}px;height:{canvasHeight}px"></canvas>
	</div>
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
	.canvas-viewport {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
	}
	canvas { display: block; }
</style>
