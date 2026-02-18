<script lang="ts">
	import { storageState } from '$lib/stores/storage.svelte.js';
	import type { EngineConfig, ColumnDef } from '$lib/wasm/storage-types.js';

	// ── Engine config form ──
	let pageSize = $state(128);
	let poolSize = $state(8);
	let diskCapacity = $state(64);
	let overflowThreshold = $state(64);

	// ── Table creation form ──
	let newTableName = $state('');
	let newColumns: { name: string; type: string; maxLen: number; nullable: boolean }[] = $state([
		{ name: 'id', type: 'Int32', nullable: false, maxLen: 255 },
		{ name: 'name', type: 'VarChar', nullable: false, maxLen: 255 },
	]);

	// ── Quick Fill form ──
	let qfTableName = $state('users');
	let qfColumns: { name: string; type: string; maxLen: number; nullable: boolean }[] = $state([
		{ name: 'id', type: 'Int32', nullable: false, maxLen: 255 },
		{ name: 'name', type: 'VarChar', nullable: false, maxLen: 32 },
		{ name: 'email', type: 'VarChar', nullable: false, maxLen: 64 },
		{ name: 'age', type: 'UInt32', nullable: false, maxLen: 255 },
		{ name: 'active', type: 'Bool', nullable: false, maxLen: 255 },
	]);
	let qfRowCount = $state(100);
	const ROW_PRESETS = [10, 50, 100, 500];

	// ── Insert form ──
	let insertValues = $state('');

	// ── Row ID input ──
	let rowIdInput = $state('');

	const PAGE_PRESETS = [64, 128, 256, 512, 1024, 4096];

	function initEngine() {
		const config: EngineConfig = {
			page_size: pageSize,
			pool_size: poolSize,
			disk_capacity: diskCapacity,
			overflow_threshold: overflowThreshold,
		};
		storageState.initEngine(config);
	}

	function addColumn() {
		newColumns = [...newColumns, { name: '', type: 'Int32', nullable: false, maxLen: 255 }];
	}

	function removeColumn(i: number) {
		newColumns = newColumns.filter((_, idx) => idx !== i);
	}

	function addQfColumn() {
		qfColumns = [...qfColumns, { name: '', type: 'Int32', nullable: false, maxLen: 255 }];
	}

	function removeQfColumn(i: number) {
		qfColumns = qfColumns.filter((_, idx) => idx !== i);
	}

	function doQuickFill() {
		if (!qfTableName.trim()) return;
		const columns: ColumnDef[] = qfColumns.map((c) => {
			let type_: string | { VarChar: number } | { Blob: number } = c.type;
			if (c.type === 'VarChar') type_ = { VarChar: c.maxLen };
			if (c.type === 'Blob') type_ = { Blob: c.maxLen };
			return { name: c.name, type: type_, nullable: c.nullable };
		});
		storageState.bootstrapTable(qfTableName.trim(), columns, qfRowCount);
	}

	function createTable() {
		if (!newTableName.trim()) return;
		const columns: ColumnDef[] = newColumns.map((c) => {
			let type_: string | { VarChar: number } | { Blob: number } = c.type;
			if (c.type === 'VarChar') type_ = { VarChar: c.maxLen };
			if (c.type === 'Blob') type_ = { Blob: c.maxLen };
			return { name: c.name, type: type_, nullable: c.nullable };
		});
		storageState.createTable(newTableName.trim(), columns);
		newTableName = '';
	}

	function doInsert() {
		if (!storageState.selectedTable || !insertValues.trim()) return;
		try {
			const vals = JSON.parse(`[${insertValues}]`);
			storageState.insert(storageState.selectedTable, vals);
			insertValues = '';
		} catch {
			storageState.insert(storageState.selectedTable, []); // will trigger error from engine
		}
	}

	function doDelete() {
		if (!storageState.selectedTable || !rowIdInput.trim()) return;
		storageState.deleteRow(storageState.selectedTable, rowIdInput.trim());
	}

	function doScan() {
		if (!storageState.selectedTable) return;
		storageState.scan(storageState.selectedTable);
	}
</script>

<div class="panel">
	{#if !storageState.engineReady}
		<!-- Engine Configuration -->
		<div class="section">
			<h3>Engine Configuration</h3>

			<span class="field-label">Page Size</span>
			<div class="presets">
				{#each PAGE_PRESETS as preset}
					<button
						class="preset-btn"
						class:active={pageSize === preset}
						onclick={() => (pageSize = preset)}
					>
						{preset >= 1024 ? `${preset / 1024}K` : preset}
					</button>
				{/each}
			</div>

			<div class="field-row">
				<label>
					<span class="field-label">Pool Size</span>
					<input type="number" bind:value={poolSize} min="4" max="32" />
					<span class="hint">{poolSize} frames</span>
				</label>
				<label>
					<span class="field-label">Disk Capacity</span>
					<input type="number" bind:value={diskCapacity} min="16" max="256" />
					<span class="hint">{diskCapacity} pages</span>
				</label>
			</div>

			<label>
				<span class="field-label">Overflow Threshold</span>
				<input type="number" bind:value={overflowThreshold} min="32" max={pageSize} />
				<span class="hint">{overflowThreshold}B</span>
			</label>

			<button class="btn primary" onclick={initEngine}>Initialize Engine</button>
		</div>
	{:else}
		<!-- Engine Summary Bar -->
		<div class="summary-bar">
			<span>Page: {storageState.config?.page_size}B</span>
			<span>Pool: {storageState.config?.pool_size} frames</span>
			<span>Disk: {storageState.config?.disk_capacity} pages</span>
			<button class="btn small danger" onclick={() => storageState.resetEngine()}>Reset</button>
		</div>

		<!-- Quick Fill -->
		<div class="section">
			<h3>Quick Fill</h3>
			<input type="text" bind:value={qfTableName} placeholder="Table name" class="text-input" />
			<div class="columns-list">
				{#each qfColumns as col, i}
					<div class="col-row">
						<input type="text" bind:value={col.name} placeholder="col name" class="col-name" />
						<select bind:value={col.type}>
							<option value="Int32">Int32</option>
							<option value="UInt32">UInt32</option>
							<option value="Float64">Float64</option>
							<option value="Bool">Bool</option>
							<option value="VarChar">VarChar</option>
							<option value="Blob">Blob</option>
						</select>
						{#if col.type === 'VarChar' || col.type === 'Blob'}
							<input type="number" bind:value={col.maxLen} min="1" max="65535" class="max-len" />
						{/if}
						<label class="nullable-check">
							<input type="checkbox" bind:checked={col.nullable} />
							<span>null</span>
						</label>
						<button class="btn-icon" onclick={() => removeQfColumn(i)} title="Remove column">&times;</button>
					</div>
				{/each}
			</div>
			<div class="btn-row">
				<button class="btn small" onclick={addQfColumn}>+ Column</button>
			</div>

			<span class="field-label">Row Count</span>
			<div class="presets">
				{#each ROW_PRESETS as preset}
					<button
						class="preset-btn"
						class:active={qfRowCount === preset}
						onclick={() => (qfRowCount = preset)}
					>
						{preset}
					</button>
				{/each}
			</div>

			<button class="btn primary" onclick={doQuickFill} disabled={!qfTableName.trim()}>Create &amp; Fill</button>
		</div>

		<!-- Create Table -->
		<div class="section">
			<h3>Create Table</h3>
			<input type="text" bind:value={newTableName} placeholder="Table name" class="text-input" />
			<div class="columns-list">
				{#each newColumns as col, i}
					<div class="col-row">
						<input type="text" bind:value={col.name} placeholder="col name" class="col-name" />
						<select bind:value={col.type}>
							<option value="Int32">Int32</option>
							<option value="UInt32">UInt32</option>
							<option value="Float64">Float64</option>
							<option value="Bool">Bool</option>
							<option value="VarChar">VarChar</option>
							<option value="Blob">Blob</option>
						</select>
						{#if col.type === 'VarChar' || col.type === 'Blob'}
							<input type="number" bind:value={col.maxLen} min="1" max="65535" class="max-len" />
						{/if}
						<label class="nullable-check">
							<input type="checkbox" bind:checked={col.nullable} />
							<span>null</span>
						</label>
						<button class="btn-icon" onclick={() => removeColumn(i)} title="Remove column">&times;</button>
					</div>
				{/each}
			</div>
			<div class="btn-row">
				<button class="btn small" onclick={addColumn}>+ Column</button>
				<button class="btn small primary" onclick={createTable} disabled={!newTableName.trim()}>Create</button>
			</div>
		</div>

		<!-- Table Selector -->
		{#if storageState.tables.length > 0}
			<div class="section">
				<h3>Table</h3>
				<div class="table-tabs">
					{#each storageState.tables as t}
						<button
							class="tab"
							class:active={storageState.selectedTable === t}
							onclick={() => storageState.selectTable(t)}
						>{t}</button>
					{/each}
				</div>

				{#if storageState.selectedTable}
					<!-- Insert -->
					<span class="field-label">Insert Row</span>
					<div class="insert-row">
						<input
							type="text"
							bind:value={insertValues}
							placeholder='42, "Alice", 3.14, true'
							class="text-input flex-1"
							onkeydown={(e) => e.key === 'Enter' && doInsert()}
						/>
						<button class="btn small primary" onclick={doInsert}>Insert</button>
					</div>

					<!-- Get / Delete -->
					<span class="field-label">Row ID</span>
					<div class="insert-row">
						<input
							type="text"
							bind:value={rowIdInput}
							placeholder="0:0"
							class="text-input"
							onkeydown={(e) => e.key === 'Enter' && doDelete()}
						/>
						<button class="btn small danger" onclick={doDelete}>Delete</button>
					</div>

					<!-- Scan -->
					<div class="btn-row">
						<button class="btn small" onclick={doScan}>Scan Table</button>
						<button class="btn small" onclick={() => storageState.flushAll()}>Flush All</button>
						<button class="btn small danger" onclick={() => storageState.dropTable(storageState.selectedTable!)}>Drop</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Scan Results -->
		{#if storageState.scanResults.length > 0}
			<div class="section results">
				<h3>Results ({storageState.scanResults.length})</h3>
				<div class="results-scroll">
					<table class="results-table">
						<thead>
							<tr>
								<th>RowID</th>
								{#each storageState.scanResults[0]?.values ?? [] as _, i}
									<th>col{i}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each storageState.scanResults as row}
								<tr>
									<td class="rowid">{row.row_id}</td>
									{#each row.values as val}
										<td>{val === null ? 'NULL' : String(val)}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Status -->
	{#if storageState.statusMsg}
		<div class="status" class:success={storageState.statusType === 'success'} class:error={storageState.statusType === 'error'}>
			{storageState.statusMsg}
		</div>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 11px;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
	}
	h3 {
		font-size: 11px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.field-label {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 2px;
	}
	.presets {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.preset-btn {
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: transparent;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		font-size: 11px;
		font-family: inherit;
	}
	.preset-btn:hover { background: rgba(255, 255, 255, 0.08); }
	.preset-btn.active {
		background: #007acc;
		color: #fff;
		border-color: #007acc;
	}
	.field-row {
		display: flex;
		gap: 8px;
	}
	.field-row label { flex: 1; display: flex; flex-direction: column; gap: 2px; }
	input[type="number"], input[type="text"], select {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		color: #fff;
		padding: 4px 6px;
		font-family: inherit;
		font-size: 11px;
		outline: none;
	}
	input:focus, select:focus { border-color: #007acc; }
	.hint {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.35);
	}
	.text-input { width: 100%; }
	.flex-1 { flex: 1; }
	.btn {
		padding: 5px 10px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		font-family: inherit;
		font-size: 11px;
	}
	.btn:hover { background: rgba(255, 255, 255, 0.12); }
	.btn:disabled { opacity: 0.3; cursor: default; }
	.btn.primary { background: #007acc; color: #fff; border-color: #007acc; }
	.btn.primary:hover { background: #005f99; }
	.btn.danger { background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.3); color: #f87171; }
	.btn.danger:hover { background: rgba(239, 68, 68, 0.3); }
	.btn.small { padding: 3px 8px; font-size: 10px; }
	.btn-icon {
		background: none; border: none; color: rgba(255, 255, 255, 0.4);
		cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1;
	}
	.btn-icon:hover { color: #f87171; }
	.btn-row { display: flex; gap: 4px; }
	.summary-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		background: rgba(0, 122, 204, 0.1);
		border: 1px solid rgba(0, 122, 204, 0.2);
		border-radius: 6px;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.7);
	}
	.summary-bar .btn { margin-left: auto; }
	.columns-list { display: flex; flex-direction: column; gap: 4px; }
	.col-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.col-name { width: 80px; }
	.max-len { width: 50px; }
	select { width: 80px; }
	.nullable-check {
		display: flex; align-items: center; gap: 2px; font-size: 10px;
		color: rgba(255, 255, 255, 0.5); cursor: pointer;
	}
	.nullable-check input { width: 12px; height: 12px; }
	.table-tabs { display: flex; gap: 2px; }
	.tab {
		padding: 3px 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		background: transparent;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		font-size: 10px;
		font-family: inherit;
	}
	.tab.active { background: #007acc; color: #fff; border-color: #007acc; }
	.insert-row { display: flex; gap: 4px; }
	.results { max-height: 200px; }
	.results-scroll { overflow: auto; max-height: 160px; }
	.results-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 10px;
	}
	.results-table th, .results-table td {
		padding: 2px 6px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		text-align: left;
		white-space: nowrap;
	}
	.results-table th {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.6);
		position: sticky;
		top: 0;
	}
	.rowid { color: #60a5fa; }
	.status {
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.04);
	}
	.status.success { color: #4ade80; background: rgba(74, 222, 128, 0.08); }
	.status.error { color: #f87171; background: rgba(248, 113, 113, 0.08); }
</style>
