<script lang="ts">
	import type { OperationResult } from '$lib/stores/linkedlist.svelte.js';

	interface Props {
		onPushFront: (value: number) => void;
		onInsertSorted: (value: number) => void;
		onDelete: (value: number) => void;
		onSearch: (value: number) => void;
		onSort: () => void;
		onClear: () => void;
		onGenerate: (count: number) => void;
		onSpeedChange: (ms: number) => void;
		onClearSelection: () => void;
		lastOp: OperationResult | null;
		nodeCount: number;
		animating: boolean;
		animationSpeed: number;
		selectedValue: number | null;
	}

	let {
		onPushFront, onInsertSorted, onDelete, onSearch,
		onSort, onClear, onGenerate, onSpeedChange, onClearSelection,
		lastOp, nodeCount, animating, animationSpeed, selectedValue
	}: Props = $props();

	let inputValue = $state('');
	let genCount = $state('50');

	function getInputNum(): number | null {
		const n = parseInt(inputValue, 10);
		return isNaN(n) ? null : n;
	}

	function handleAction(action: (v: number) => void) {
		const n = getInputNum();
		if (n === null) return;
		action(n);
		inputValue = '';
	}

	function handleDelete() {
		const n = getInputNum();
		if (n !== null) {
			onDelete(n);
			inputValue = '';
		} else if (selectedValue !== null) {
			onDelete(selectedValue);
			onClearSelection();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleAction(onInsertSorted);
		}
	}

	function statusText(op: OperationResult): string {
		switch (op.kind) {
			case 'push_front': return `pushed ${op.value} to front`;
			case 'insert_sorted': return `inserted ${op.value} (sorted)`;
			case 'delete': return op.found ? `deleted ${op.value}` : `${op.value} not found`;
			case 'search': return op.foundIndex !== null ? `found ${op.value} at [${op.foundIndex}]` : `${op.value} not found`;
			case 'sort': return 'list sorted (merge sort)';
			case 'clear': return 'list cleared';
			case 'generate': return `generated random list`;
			default: return '';
		}
	}

	function statusKind(op: OperationResult): string {
		switch (op.kind) {
			case 'delete': return op.found ? 'delete' : 'warn';
			case 'search': return op.foundIndex !== null ? 'found' : 'warn';
			default: return 'ok';
		}
	}
</script>

<div class="panel">
	<!-- Row 1: Value input + CRUD operations -->
	<div class="row">
		<input
			type="number"
			inputmode="numeric"
			bind:value={inputValue}
			onkeydown={handleKeydown}
			placeholder="value"
			class="input"
			disabled={animating}
		/>
		<div class="btn-group">
			<button onclick={() => handleAction(onPushFront)} disabled={animating || !inputValue} class="btn">
				push front
			</button>
			<button onclick={() => handleAction(onInsertSorted)} disabled={animating || !inputValue} class="btn primary">
				insert sorted
			</button>
			<button onclick={handleDelete} disabled={animating || (!inputValue && selectedValue === null)} class="btn danger">
				{selectedValue !== null && !inputValue ? `delete [${selectedValue}]` : 'delete'}
			</button>
			<button onclick={() => handleAction(onSearch)} disabled={animating || !inputValue} class="btn">
				search
			</button>
		</div>
	</div>

	<!-- Row 2: Generate, sort, clear, speed, count -->
	<div class="row">
		<div class="gen-group">
			<input
				type="number"
				inputmode="numeric"
				bind:value={genCount}
				placeholder="n"
				class="input input-sm"
				min="1"
				max="500"
			/>
			<button onclick={() => onGenerate(parseInt(genCount) || 50)} disabled={animating} class="btn">
				generate
			</button>
		</div>
		<button onclick={onSort} disabled={animating || nodeCount === 0} class="btn primary">
			sort
		</button>
		<button onclick={onClear} disabled={animating} class="btn">
			clear
		</button>

		<div class="spacer"></div>

		<div class="speed">
			<label for="speed">speed</label>
			<input
				id="speed"
				type="range"
				min="20"
				max="500"
				value={animationSpeed}
				oninput={(e) => onSpeedChange(parseInt((e.target as HTMLInputElement).value))}
			/>
			<span class="speed-val">{animationSpeed}ms</span>
		</div>

		<span class="count">{nodeCount} nodes</span>
	</div>

	{#if lastOp}
		<div class="status {statusKind(lastOp)}">
			{statusText(lastOp)}
		</div>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.gen-group {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.input {
		background: #1a1a1a;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.87);
		padding: 4px 8px;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 12px;
		width: 80px;
		outline: none;
		transition: border-color 0.15s;
	}
	.input:focus {
		border-color: #007acc;
	}
	.input-sm {
		width: 50px;
	}
	.input::placeholder {
		color: rgba(255, 255, 255, 0.25);
	}
	.btn-group {
		display: flex;
		gap: 2px;
	}
	.btn {
		padding: 4px 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		background: transparent;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
	}
	.btn:hover:not(:disabled) {
		color: rgba(255, 255, 255, 0.87);
		background: rgba(255, 255, 255, 0.06);
	}
	.btn:active:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
	}
	.btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.btn.primary {
		color: #007acc;
		border-color: rgba(0, 122, 204, 0.3);
	}
	.btn.primary:hover:not(:disabled) {
		background: rgba(0, 122, 204, 0.12);
		color: #3794d6;
	}
	.btn.danger {
		color: rgba(255, 255, 255, 0.6);
	}
	.btn.danger:hover:not(:disabled) {
		color: #f87171;
		border-color: rgba(248, 113, 113, 0.3);
		background: rgba(248, 113, 113, 0.08);
	}
	.spacer {
		flex: 1;
	}
	.speed {
		display: flex;
		gap: 6px;
		align-items: center;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.4);
	}
	.speed input[type="range"] {
		width: 60px;
		accent-color: #007acc;
		height: 2px;
	}
	.speed-val {
		min-width: 36px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.count {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.3);
		margin-left: 8px;
		font-variant-numeric: tabular-nums;
	}
	.status {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
		padding: 3px 8px;
		border-radius: 4px;
	}
	.status.ok {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.08);
	}
	.status.found {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.08);
	}
	.status.delete {
		color: #f87171;
		background: rgba(248, 113, 113, 0.08);
	}
	.status.warn {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.08);
	}

	/* ---- Mobile ---- */
	@media (max-width: 640px) {
		.panel {
			padding: 8px 12px;
			gap: 8px;
		}
		.row {
			gap: 6px;
		}
		.input {
			height: 36px;
			font-size: 14px;
			padding: 6px 10px;
			flex: 1;
			min-width: 0;
			width: auto;
		}
		.input-sm {
			flex: 0 0 56px;
		}
		.btn-group {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 6px;
			width: 100%;
		}
		.btn {
			height: 36px;
			font-size: 12px;
			padding: 6px 8px;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		.gen-group {
			flex: 1;
		}
		.gen-group .input {
			flex: 0 0 56px;
		}
		.spacer {
			display: none;
		}
		.speed {
			width: 100%;
			margin-top: 2px;
		}
		.speed input[type="range"] {
			flex: 1;
			height: 20px;
		}
		.count {
			margin-left: auto;
		}
	}
</style>
