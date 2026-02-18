<script lang="ts">
	import { onMount } from 'svelte';
	import { storageState } from '$lib/stores/storage.svelte.js';
	import { layoutState } from '$lib/stores/layout.svelte.js';
	import StorageControlPanel from '$lib/components/storage/StorageControlPanel.svelte';
	import BufferPoolCanvas from '$lib/components/storage/BufferPoolCanvas.svelte';
	import DiskCanvas from '$lib/components/storage/DiskCanvas.svelte';
	import PageInspectorCanvas from '$lib/components/storage/PageInspectorCanvas.svelte';
	import PaneDivider from '$lib/components/PaneDivider.svelte';
	import PaneHeader from '$lib/components/PaneHeader.svelte';

	let loading = $state(true);
	let isMobile = $state(false);
	let vizContainer = $state<HTMLDivElement>(undefined!);
	let topRowEl = $state<HTMLDivElement>(undefined!);
	let vizHeight = $state(0);
	let topRowWidth = $state(0);

	onMount(() => {
		storageState.initWasm().then(() => { loading = false; });

		const mql = window.matchMedia('(max-width: 768px)');
		isMobile = mql.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mql.addEventListener('change', handler);

		return () => mql.removeEventListener('change', handler);
	});

	$effect(() => {
		if (!vizContainer) return;
		const ro = new ResizeObserver((entries) => {
			vizHeight = entries[0].contentRect.height;
		});
		ro.observe(vizContainer);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!topRowEl) return;
		const ro = new ResizeObserver((entries) => {
			topRowWidth = entries[0].contentRect.width;
		});
		ro.observe(topRowEl);
		return () => ro.disconnect();
	});

	function handleHorizontalResize(delta: number) {
		if (vizHeight === 0) return;
		layoutState.setTopBottomRatio(layoutState.topBottomRatio + delta / vizHeight);
	}

	function handleVerticalResize(delta: number) {
		if (topRowWidth === 0) return;
		layoutState.setLeftRightRatio(layoutState.leftRightRatio + delta / topRowWidth);
	}

	// Compute flex styles for panes
	let topRowFlex = $derived(
		layoutState.inspectorCollapsed
			? '1 1 0%'
			: `${layoutState.topBottomRatio} 1 0%`
	);
	let bottomRowFlex = $derived(
		layoutState.inspectorCollapsed
			? '0 0 24px'
			: `${1 - layoutState.topBottomRatio} 1 0%`
	);
	let bpFlex = $derived(
		layoutState.diskCollapsed
			? '1 1 0%'
			: `${layoutState.leftRightRatio} 1 0%`
	);
	let diskFlex = $derived(
		layoutState.bufferPoolCollapsed
			? '1 1 0%'
			: `${1 - layoutState.leftRightRatio} 1 0%`
	);
</script>

<svelte:head>
	<title>wizalloc - Storage Engine</title>
</svelte:head>

{#if loading}
	<div class="loading">
		<div class="spinner"></div>
		<span>Loading WASM...</span>
	</div>
{:else}
	<div class="layout">
		<aside class="sidebar">
			<StorageControlPanel />
		</aside>
		<div class="visualizations" bind:this={vizContainer}>
			<div class="viz-row top" bind:this={topRowEl} style="flex:{topRowFlex}">
				{#if layoutState.bufferPoolCollapsed}
					<div class="viz-panel collapsed-h">
						<PaneHeader title="Buffer Pool" collapsed={true} onToggle={layoutState.toggleBufferPool} vertical={true} />
					</div>
				{:else}
					<div class="viz-panel" style="flex:{bpFlex}">
						<PaneHeader title="Buffer Pool" collapsed={false} onToggle={layoutState.toggleBufferPool} />
						<div class="pane-content">
							<BufferPoolCanvas />
						</div>
					</div>
				{/if}
				{#if !isMobile && !layoutState.bufferPoolCollapsed && !layoutState.diskCollapsed}
					<PaneDivider orientation="vertical" onResize={handleVerticalResize} />
				{/if}
				{#if layoutState.diskCollapsed}
					<div class="viz-panel collapsed-h">
						<PaneHeader title="Disk" collapsed={true} onToggle={layoutState.toggleDisk} vertical={true} />
					</div>
				{:else}
					<div class="viz-panel" style="flex:{diskFlex}">
						<PaneHeader title="Disk" collapsed={false} onToggle={layoutState.toggleDisk} />
						<div class="pane-content">
							<DiskCanvas />
						</div>
					</div>
				{/if}
			</div>
			{#if !isMobile && !layoutState.inspectorCollapsed}
				<PaneDivider orientation="horizontal" onResize={handleHorizontalResize} />
			{/if}
			<div class="viz-row bottom" style="flex:{bottomRowFlex}">
				<div class="viz-panel wide">
					<PaneHeader title="Page Inspector" collapsed={layoutState.inspectorCollapsed} onToggle={layoutState.toggleInspector} />
					{#if !layoutState.inspectorCollapsed}
						<div class="pane-content">
							<PageInspectorCanvas />
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		height: 100%;
		color: rgba(255, 255, 255, 0.5);
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 13px;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: #007acc;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.layout {
		display: flex;
		height: 100%;
		min-height: 0;
	}
	.sidebar {
		width: 300px;
		min-width: 260px;
		max-width: 340px;
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		overflow-y: auto;
		flex-shrink: 0;
	}
	.visualizations {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.viz-row {
		display: flex;
		min-height: 0;
	}
	.viz-panel {
		min-width: 0;
		min-height: 0;
		position: relative;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.viz-panel.collapsed-h {
		flex: 0 0 24px;
		flex-direction: row;
	}
	.viz-panel.wide {
		flex: 1;
	}
	.pane-content {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	@media (max-width: 768px) {
		.layout {
			flex-direction: column;
		}
		.sidebar {
			width: 100%;
			max-width: none;
			max-height: 40vh;
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		}
		.viz-row.top {
			flex-direction: column;
		}
		.viz-panel {
			flex: 1 1 0% !important;
			min-height: 150px;
		}
	}
</style>
