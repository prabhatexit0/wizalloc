<script lang="ts">
	import { onMount } from 'svelte';
	import { createLinkedListStore } from '$lib/stores/linkedlist.svelte.js';
	import LinkedListCanvas from '$lib/components/LinkedListCanvas.svelte';
	import ControlPanel from '$lib/components/ControlPanel.svelte';

	const store = createLinkedListStore();

	onMount(async () => {
		await store.initialize();
		return () => store.destroy();
	});
</script>

{#if !store.ready}
	<div class="loading">
		<div class="spinner"></div>
		<span>loading wasm engine…</span>
	</div>
{:else}
	<div class="page">
		<div class="page-header">
			<div class="page-title">
				<span class="label">Linked List</span>
				<span class="sub">O(n) sequential access</span>
			</div>
			<div class="legend">
				<span class="legend-item"><span class="dot" style="background: rgba(250, 204, 21, 0.5)"></span>visiting</span>
				<span class="legend-item"><span class="dot" style="background: rgba(74, 222, 128, 0.5)"></span>inserted</span>
				<span class="legend-item"><span class="dot" style="background: rgba(248, 113, 113, 0.5)"></span>deleted</span>
				<span class="legend-item"><span class="dot" style="background: rgba(96, 165, 250, 0.6)"></span>found</span>
			</div>
		</div>

		<ControlPanel
			onPushFront={store.pushFront}
			onInsertSorted={store.insertSorted}
			onDelete={store.deleteValue}
			onSearch={store.searchValue}
			onSort={store.sortList}
			onClear={store.clear}
			onGenerate={store.generateRandom}
			onSpeedChange={store.setAnimationSpeed}
			lastOp={store.lastOp}
			nodeCount={store.snapshot.length}
			animating={store.animating}
			animationSpeed={store.animationSpeed}
		/>

		<LinkedListCanvas
			snapshot={store.snapshot}
			animatingSteps={store.animatingSteps}
			activeStepIndex={store.activeStepIndex}
		/>
	</div>
{/if}

<style>
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		flex: 1;
		color: rgba(255, 255, 255, 0.4);
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 12px;
	}
	.spinner {
		width: 14px;
		height: 14px;
		border: 1.5px solid rgba(255, 255, 255, 0.1);
		border-top-color: #007acc;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	.page {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}
	.page-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.label {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 12px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.6);
	}
	.sub {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.25);
	}
	.legend {
		display: flex;
		gap: 12px;
	}
	.legend-item {
		display: flex;
		align-items: center;
		gap: 4px;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.3);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		display: inline-block;
	}

	@media (max-width: 640px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 4px;
			padding: 6px 12px;
		}
		.page-title {
			gap: 6px;
		}
		.legend {
			gap: 10px;
		}
		.sub {
			display: none;
		}
	}
</style>
