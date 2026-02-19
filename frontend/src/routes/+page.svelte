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
		{#if isMobile}
			<!-- Mobile: all panes stacked vertically with collapsible headers -->
			<aside class="sidebar" class:collapsed={layoutState.sidebarCollapsed}>
				<PaneHeader title="Controls" collapsed={layoutState.sidebarCollapsed} onToggle={layoutState.toggleSidebar} />
				{#if !layoutState.sidebarCollapsed}
					<div class="sidebar-content">
						<StorageControlPanel />
					</div>
				{/if}
			</aside>
			<div class="visualizations mobile-viz" bind:this={vizContainer}>
				<div class="mobile-pane" class:collapsed={layoutState.bufferPoolCollapsed}>
					<PaneHeader title="Buffer Pool" collapsed={layoutState.bufferPoolCollapsed} onToggle={layoutState.toggleBufferPool} />
					{#if !layoutState.bufferPoolCollapsed}
						<div class="pane-content">
							<BufferPoolCanvas />
						</div>
					{/if}
				</div>
				<div class="mobile-pane" class:collapsed={layoutState.diskCollapsed}>
					<PaneHeader title="Disk" collapsed={layoutState.diskCollapsed} onToggle={layoutState.toggleDisk} />
					{#if !layoutState.diskCollapsed}
						<div class="pane-content">
							<DiskCanvas />
						</div>
					{/if}
				</div>
				<div class="mobile-pane" class:collapsed={layoutState.inspectorCollapsed}>
					<PaneHeader title="Page Inspector" collapsed={layoutState.inspectorCollapsed} onToggle={layoutState.toggleInspector} />
					{#if !layoutState.inspectorCollapsed}
						<div class="pane-content">
							<PageInspectorCanvas />
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Desktop: resizable split panes -->
			{#if layoutState.sidebarCollapsed}
				<aside class="sidebar collapsed">
					<PaneHeader title="Controls" collapsed={true} onToggle={layoutState.toggleSidebar} vertical={true} />
				</aside>
			{:else}
				<aside class="sidebar">
					<PaneHeader title="Controls" collapsed={false} onToggle={layoutState.toggleSidebar} />
					<div class="sidebar-content">
						<StorageControlPanel />
					</div>
				</aside>
			{/if}
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
					{#if !layoutState.bufferPoolCollapsed && !layoutState.diskCollapsed}
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
				{#if !layoutState.inspectorCollapsed}
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
		{/if}
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
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.sidebar.collapsed {
		width: auto;
		min-width: 0;
		max-width: none;
		flex-direction: row;
	}
	.sidebar-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
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

	/* Mobile: vertically stacked collapsible panes */
	.mobile-viz {
		flex-direction: column;
	}
	.mobile-pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.mobile-pane:not(.collapsed) {
		flex: 1 1 0%;
		min-height: 120px;
	}
	.mobile-pane.collapsed {
		flex: 0 0 auto;
	}

	@media (max-width: 768px) {
		.layout {
			flex-direction: column;
		}
		.sidebar {
			width: 100% !important;
			max-width: none !important;
			min-width: 0 !important;
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
			flex-shrink: 0;
		}
		.sidebar:not(.collapsed) {
			max-height: 40vh;
		}
		.sidebar.collapsed {
			max-height: none;
			flex-direction: column;
		}
	}
</style>
