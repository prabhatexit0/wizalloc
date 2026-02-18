<script lang="ts">
	interface Props {
		orientation: 'horizontal' | 'vertical';
		onResize: (deltaPixels: number) => void;
	}

	let { orientation, onResize }: Props = $props();
	let dragging = $state(false);

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const delta = orientation === 'horizontal' ? e.movementY : e.movementX;
		onResize(delta);
	}

	function stopDrag() {
		dragging = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="divider {orientation}"
	class:dragging
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={stopDrag}
	onpointercancel={stopDrag}
	onlostpointercapture={stopDrag}
></div>

<style>
	.divider {
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.06);
		z-index: 2;
	}
	.divider:hover {
		background: #007acc;
	}
	.divider.dragging {
		background: #007acc;
	}
	.divider.vertical {
		width: 4px;
		cursor: col-resize;
	}
	.divider.horizontal {
		height: 4px;
		cursor: row-resize;
	}
</style>
