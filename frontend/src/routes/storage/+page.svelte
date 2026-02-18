<script lang="ts">
	import { onMount } from 'svelte';
	import { storageState } from '$lib/stores/storage.svelte.js';
	import StorageControlPanel from '$lib/components/storage/StorageControlPanel.svelte';
	import BufferPoolCanvas from '$lib/components/storage/BufferPoolCanvas.svelte';
	import DiskCanvas from '$lib/components/storage/DiskCanvas.svelte';
	import PageInspectorCanvas from '$lib/components/storage/PageInspectorCanvas.svelte';

	let loading = $state(true);

	onMount(async () => {
		await storageState.initWasm();
		loading = false;
	});
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
		<div class="visualizations">
			<div class="viz-row top">
				<div class="viz-panel">
					<BufferPoolCanvas />
				</div>
				<div class="viz-panel">
					<DiskCanvas />
				</div>
			</div>
			<div class="viz-row bottom">
				<div class="viz-panel wide">
					<PageInspectorCanvas />
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
	.viz-row.top {
		flex: 1;
	}
	.viz-row.bottom {
		flex: 1;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}
	.viz-panel {
		flex: 1;
		min-width: 0;
		min-height: 0;
		position: relative;
	}
	.viz-panel:not(:last-child) {
		border-right: 1px solid rgba(255, 255, 255, 0.06);
	}
	.viz-panel.wide {
		flex: 1;
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
		.viz-panel:not(:last-child) {
			border-right: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		}
	}
</style>
