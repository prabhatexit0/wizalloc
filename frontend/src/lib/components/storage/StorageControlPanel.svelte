<script lang="ts">
	import { storageState } from '$lib/stores/storage.svelte.js';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import type { EngineConfig, ColumnDef } from '$lib/wasm/storage-types.js';
	import { formatBytes, parseCSV, inferColumnTypes } from '$lib/wasm/storage-types.js';

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

	// ── Load Data form ──
	let ldTableName = $state('');
	let ldHeaders: string[] = $state([]);
	let ldRows: string[][] = $state([]);
	let ldColumns: ColumnDef[] = $state([]);
	let ldParsed = $state(false);
	let ldError = $state('');
	let loadDataOpen = $state(true);

	// ── Insert form ──
	let insertValues = $state('');

	// ── Row ID input ──
	let rowIdInput = $state('');

	// ── Collapsible state ──
	let quickFillOpen = $state(true);
	let createTableOpen = $state(true);
	let tableOpsOpen = $state(true);
	let scanResultsOpen = $state(true);

	// ── Search filter ──
	let filterText = $state('');

	const PAGE_PRESETS = [64, 128, 256, 512, 1024, 4096];

	// Auto-collapse Quick Fill and Create Table once a table exists
	let hasAutoCollapsed = $state(false);
	$effect(() => {
		if (storageState.tables.length > 0 && !hasAutoCollapsed) {
			quickFillOpen = false;
			createTableOpen = false;
			loadDataOpen = false;
			hasAutoCollapsed = true;
		}
	});

	// Filtered scan results
	let filteredResults = $derived.by(() => {
		const rows = storageState.scanResults;
		if (!filterText.trim()) return rows;
		const q = filterText.trim().toLowerCase();
		return rows.filter(row => {
			if (row.row_id.toLowerCase().includes(q)) return true;
			return row.values.some(v => String(v ?? 'NULL').toLowerCase().includes(q));
		});
	});

	// Format column type for display
	function formatColType(type: string | { VarChar: number } | { Blob: number }): string {
		if (typeof type === 'object') {
			if ('VarChar' in type) return `VarChar(${type.VarChar})`;
			if ('Blob' in type) return `Blob(${type.Blob})`;
		}
		return String(type);
	}

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

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		ldError = '';
		ldParsed = false;

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const text = reader.result as string;
				const { headers, rows } = parseCSV(text);
				if (headers.length === 0) {
					ldError = 'No columns found in CSV';
					return;
				}
				ldHeaders = headers;
				ldRows = rows;
				ldColumns = inferColumnTypes(headers, rows);
				ldParsed = true;

				// Auto-fill table name from filename
				if (!ldTableName.trim()) {
					ldTableName = file.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
				}
			} catch (e) {
				ldError = String(e);
			}
		};
		reader.readAsText(file);
	}

	function doLoadData() {
		if (!ldTableName.trim() || !ldParsed) return;
		storageState.loadFromCSV(ldTableName.trim(), ldHeaders, ldRows, ldColumns);
		// Reset form
		ldTableName = '';
		ldHeaders = [];
		ldRows = [];
		ldColumns = [];
		ldParsed = false;
		ldError = '';
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

	function doGet() {
		if (!storageState.selectedTable || !rowIdInput.trim()) return;
		storageState.getRow(storageState.selectedTable, rowIdInput.trim());
	}

	function doDelete() {
		if (!storageState.selectedTable || !rowIdInput.trim()) return;
		storageState.deleteRow(storageState.selectedTable, rowIdInput.trim());
	}

	function doScan() {
		if (!storageState.selectedTable) return;
		filterText = '';
		storageState.scan(storageState.selectedTable);
		scanResultsOpen = true;
	}

	function handleRowClick(rowId: string) {
		storageState.clearCellSelection();
		storageState.selectRowFromScan(rowId);
	}

	function handleCellClick(e: MouseEvent, rowId: string, colIndex: number, value: unknown) {
		e.stopPropagation();
		storageState.selectCell(rowId, colIndex, value);
	}

	function estimateByteSize(colType: string | { VarChar: number } | { Blob: number }, value: unknown): number {
		if (value === null) return 1; // null bitmap bit, but at least 1 byte for the indicator
		if (typeof colType === 'object') {
			if ('VarChar' in colType) return 2 + new TextEncoder().encode(String(value)).length; // 2-byte len prefix + UTF-8
			if ('Blob' in colType) return 2 + String(value).length / 2; // 2-byte len prefix + raw bytes
		}
		switch (colType) {
			case 'Int32': case 'UInt32': return 4;
			case 'Float64': return 8;
			case 'Bool': return 1;
			default: return 0;
		}
	}

	function colTypeName(colType: string | { VarChar: number } | { Blob: number }): string {
		if (typeof colType === 'object') {
			if ('VarChar' in colType) return 'VarChar';
			if ('Blob' in colType) return 'Blob';
		}
		return String(colType);
	}
</script>

<div class="panel">
	{#if !storageState.engineReady}
		<!-- Engine Configuration -->
		<div class="section">
			<h3>Engine Configuration</h3>
			<p class="desc">Configure the storage engine's page size, buffer pool capacity, and disk size</p>

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
		<CollapsibleSection
			title="Quick Fill"
			bind:open={quickFillOpen}
			description="Create a table and populate it with random data to explore the storage engine"
		>
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
		</CollapsibleSection>

		<!-- Load Data -->
		<CollapsibleSection
			title="Load Data"
			bind:open={loadDataOpen}
			description="Upload a CSV file to create a table with auto-inferred column types"
		>
			<input type="text" bind:value={ldTableName} placeholder="Table name" class="text-input" />
			<div class="file-picker">
				<input
					type="file"
					accept=".csv"
					class="file-input-hidden"
					onchange={handleFileSelect}
					id="csv-file-input"
				/>
				<label for="csv-file-input" class="btn small">Choose CSV File...</label>
			</div>

			{#if ldError}
				<span class="hint" style="color: #f87171;">{ldError}</span>
			{/if}

			{#if ldParsed}
				<span class="hint">{ldRows.length} rows, {ldColumns.length} columns</span>
				<div class="schema-pills">
					{#each ldColumns as col}
						<span class="schema-pill">
							{col.name}: {formatColType(col.type)}{col.nullable ? '?' : ''}
						</span>
					{/each}
				</div>
				<button
					class="btn primary"
					onclick={doLoadData}
					disabled={!ldTableName.trim()}
				>Load {ldRows.length} Rows</button>
			{/if}
		</CollapsibleSection>

		<!-- Create Table -->
		<CollapsibleSection
			title="Create Table"
			bind:open={createTableOpen}
		>
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
		</CollapsibleSection>

		<!-- Table Operations -->
		{#if storageState.tables.length > 0}
			<CollapsibleSection
				title="Table"
				bind:open={tableOpsOpen}
				description="Insert, delete, and scan rows. Row IDs are in page:slot format"
			>
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
					<!-- Table Info Panel -->
					{#if storageState.tableInfo}
						{@const info = storageState.tableInfo}
						<div class="table-info">
							<div class="schema-pills">
								{#each info.columns as col}
									<span class="schema-pill">
										{col.name}: {formatColType(col.type)}
									</span>
								{/each}
							</div>
							<div class="table-stats">
								<span>{info.rowCount} rows</span>
								<span class="dot-sep"></span>
								<span>{info.pageIds.length} pages</span>
								<span class="dot-sep"></span>
								<span>{formatBytes(info.pageIds.length * (storageState.config?.page_size ?? 0))}</span>
							</div>
							{#if info.pageIds.length > 0}
								<div class="page-chain">
									{#each info.pageIds as pgId, i}
										<button
											class="page-link"
											class:active={storageState.selectedPageId === pgId}
											onclick={() => storageState.selectPage(pgId)}
										>Pg {pgId}</button>
										{#if i < info.pageIds.length - 1}
											<span class="chain-arrow">&rarr;</span>
										{/if}
									{/each}
								</div>
							{/if}
						</div>
					{/if}

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
							onkeydown={(e) => e.key === 'Enter' && doGet()}
						/>
						<button class="btn small" onclick={doGet}>Get</button>
						<button class="btn small danger" onclick={doDelete}>Delete</button>
					</div>

					<!-- Get Row Result -->
					{#if storageState.getRowResult}
						{@const result = storageState.getRowResult}
						<div class="get-result">
							<div class="get-result-header">
								<span class="get-result-label">Row {result.rowId}</span>
								<button class="btn-icon get-result-close" onclick={() => storageState.clearGetResult()}>&times;</button>
							</div>
							<div class="results-scroll get-result-scroll">
								<table class="results-table">
									<thead>
										<tr>
											<th>RowID</th>
											{#each storageState.scanColumns as colName}
												<th>{colName}</th>
											{:else}
												{#each result.values as _, i}
													<th>col{i}</th>
												{/each}
											{/each}
										</tr>
									</thead>
									<tbody>
										<tr class="clickable-row selected-row">
											<td class="rowid">{result.rowId}</td>
											{#each result.values as val, colIdx}
												<td
													class="clickable-cell"
													class:selected-cell={storageState.selectedCell?.rowId === result.rowId && storageState.selectedCell?.colIndex === colIdx}
													onclick={(e) => handleCellClick(e, result.rowId, colIdx, val)}
												>{val === null ? 'NULL' : String(val)}</td>
											{/each}
										</tr>
									</tbody>
								</table>
							</div>
							<!-- Cell info for get result -->
							{#if storageState.selectedCell && storageState.selectedCell.rowId === result.rowId && storageState.tableInfo}
								{@const cell = storageState.selectedCell}
								{@const col = storageState.tableInfo.columns[cell.colIndex]}
								{@const parts = cell.rowId.split(':')}
								{@const pgId = parseInt(parts[0], 10)}
								{@const slotIdx = parseInt(parts[1], 10)}
								{@const byteSize = col ? estimateByteSize(col.type, cell.value) : 0}
								{@const snap = storageState.pageSnapshot}
								{@const slot = snap && slotIdx < snap.slots.length ? snap.slots[slotIdx] : null}
								<div class="cell-info cell-info-inline">
									<button class="cell-info-close" onclick={() => storageState.clearCellSelection()}>&times;</button>
									<div class="cell-info-header">
										<span class="cell-info-value">"{cell.value === null ? 'NULL' : String(cell.value)}"</span>
									</div>
									<div class="cell-info-details">
										{#if col}
											<span>Column: <strong>{col.name}</strong> ({formatColType(col.type)})</span>
											<span>Encoded size: ~{byteSize}B as {colTypeName(col.type)}{typeof col.type === 'object' && 'VarChar' in col.type ? ` (2B len + ${byteSize - 2}B UTF-8)` : ''}</span>
										{/if}
										<span>Location: Page {pgId}, Slot [{slotIdx}]{#if slot && slot.length > 0}, tuple offset {slot.offset}, {slot.length}B total{/if}</span>
										{#if col}
											{@const offsetInTuple = storageState.tableInfo.columns.slice(0, cell.colIndex).reduce((acc, c) => acc + estimateByteSize(c.type, null), 0)}
											<span>Field offset in tuple: ~byte {offsetInTuple}</span>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Scan -->
					<div class="btn-row">
						<button class="btn small" onclick={doScan}>Scan Table</button>
						<button class="btn small" onclick={() => storageState.flushAll()}>Flush All</button>
						<button class="btn small danger" onclick={() => storageState.dropTable(storageState.selectedTable!)}>Drop</button>
					</div>
				{/if}
			</CollapsibleSection>
		{/if}

		<!-- Scan Results -->
		{#if storageState.scanResults.length > 0}
			<CollapsibleSection
				title="Scan Results"
				bind:open={scanResultsOpen}
				badge={filteredResults.length === storageState.scanResults.length ? String(storageState.scanResults.length) : `${filteredResults.length}/${storageState.scanResults.length}`}
				description="Click any row to see which page it lives on and inspect its memory layout"
			>
				<!-- Filter box -->
				<div class="filter-box">
					<input
						type="text"
						bind:value={filterText}
						placeholder="Filter rows..."
						class="text-input filter-input"
					/>
					{#if filterText.trim()}
						<span class="filter-count">
							Showing {filteredResults.length} of {storageState.scanResults.length} rows
						</span>
					{/if}
				</div>

				<div class="results-scroll">
					<table class="results-table">
						<thead>
							<tr>
								<th>RowID</th>
								{#each storageState.scanColumns as colName}
									<th>{colName}</th>
								{:else}
									{#each storageState.scanResults[0]?.values ?? [] as _, i}
										<th>col{i}</th>
									{/each}
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each filteredResults as row}
								{@const isRowSelected = storageState.selectedSlotId !== null && (() => {
									const parts = row.row_id.split(':');
									return parseInt(parts[0], 10) === storageState.selectedPageId && parseInt(parts[1], 10) === storageState.selectedSlotId;
								})()}
								<tr
									class="clickable-row"
									class:selected-row={isRowSelected}
									onclick={() => handleRowClick(row.row_id)}
								>
									<td class="rowid">{row.row_id}</td>
									{#each row.values as val, colIdx}
										<td
											class="clickable-cell"
											class:selected-cell={storageState.selectedCell?.rowId === row.row_id && storageState.selectedCell?.colIndex === colIdx}
											onclick={(e) => handleCellClick(e, row.row_id, colIdx, val)}
										>{val === null ? 'NULL' : String(val)}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Cell storage info -->
				{#if storageState.selectedCell && storageState.tableInfo}
					{@const cell = storageState.selectedCell}
					{@const col = storageState.tableInfo.columns[cell.colIndex]}
					{@const parts = cell.rowId.split(':')}
					{@const pgId = parseInt(parts[0], 10)}
					{@const slotIdx = parseInt(parts[1], 10)}
					{@const byteSize = col ? estimateByteSize(col.type, cell.value) : 0}
					{@const snap = storageState.pageSnapshot}
					{@const slot = snap && slotIdx < snap.slots.length ? snap.slots[slotIdx] : null}
					<div class="cell-info">
						<button class="cell-info-close" onclick={() => storageState.clearCellSelection()}>&times;</button>
						<div class="cell-info-header">
							<span class="cell-info-value">"{cell.value === null ? 'NULL' : String(cell.value)}"</span>
						</div>
						<div class="cell-info-details">
							{#if col}
								<span>Column: <strong>{col.name}</strong> ({formatColType(col.type)})</span>
								<span>Encoded size: ~{byteSize}B as {colTypeName(col.type)}{typeof col.type === 'object' && 'VarChar' in col.type ? ` (2B len + ${byteSize - 2}B UTF-8)` : ''}</span>
							{/if}
							<span>Location: Page {pgId}, Slot [{slotIdx}]{#if slot && slot.length > 0}, tuple offset {slot.offset}, {slot.length}B total{/if}</span>
							{#if col}
								{@const offsetInTuple = storageState.tableInfo.columns.slice(0, cell.colIndex).reduce((acc, c) => acc + estimateByteSize(c.type, null), 0)}
								<span>Field offset in tuple: ~byte {offsetInTuple}</span>
							{/if}
						</div>
					</div>
				{/if}
			</CollapsibleSection>
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
	.desc {
		margin: 0;
		font-size: 10px;
		font-style: italic;
		color: rgba(255, 255, 255, 0.35);
		line-height: 1.4;
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
	.table-tabs { display: flex; gap: 2px; flex-wrap: wrap; }
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

	/* Table Info Panel */
	.table-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
	}
	.schema-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.schema-pill {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 3px;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.8);
		border: 1px solid rgba(96, 165, 250, 0.15);
	}
	.table-stats {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
	}
	.dot-sep::before {
		content: '\00B7';
		color: rgba(255, 255, 255, 0.3);
	}
	.page-chain {
		display: flex;
		align-items: center;
		gap: 3px;
		flex-wrap: wrap;
	}
	.page-link {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 3px;
		background: rgba(74, 222, 128, 0.08);
		border: 1px solid rgba(74, 222, 128, 0.15);
		color: rgba(74, 222, 128, 0.7);
		cursor: pointer;
		font-family: inherit;
	}
	.page-link:hover {
		background: rgba(74, 222, 128, 0.15);
		color: rgba(74, 222, 128, 0.9);
	}
	.page-link.active {
		background: rgba(192, 132, 252, 0.15);
		border-color: rgba(192, 132, 252, 0.3);
		color: #c084fc;
	}
	.chain-arrow {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.25);
	}

	/* Filter box */
	.filter-box {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.filter-input {
		font-size: 10px;
	}
	.filter-count {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Scan Results */
	.results-scroll { overflow: auto; max-height: 200px; }
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
		background: #2a2a2a;
		color: rgba(255, 255, 255, 0.8);
		position: sticky;
		top: 0;
		z-index: 1;
		font-weight: 600;
	}
	.rowid { color: #60a5fa; }
	.clickable-row {
		cursor: pointer;
	}
	.clickable-row:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.selected-row {
		background: rgba(0, 212, 255, 0.08) !important;
		outline: 1px solid rgba(0, 212, 255, 0.2);
	}
	.clickable-cell {
		cursor: pointer;
		transition: background 0.1s;
	}
	.clickable-cell:hover {
		background: rgba(192, 132, 252, 0.12);
	}
	.selected-cell {
		background: rgba(192, 132, 252, 0.18) !important;
		outline: 1px solid rgba(192, 132, 252, 0.4);
	}

	/* Get Row Result */
	.get-result {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		background: rgba(96, 165, 250, 0.04);
		border: 1px solid rgba(96, 165, 250, 0.15);
		border-radius: 4px;
	}
	.get-result-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.get-result-label {
		font-size: 9px;
		color: #60a5fa;
		font-weight: 600;
	}
	.get-result-close {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.3);
		padding: 0 2px;
	}
	.get-result-close:hover { color: rgba(255, 255, 255, 0.6); }
	.get-result-scroll {
		max-height: 60px;
	}
	.cell-info-inline {
		margin-top: 2px;
	}

	/* Cell Info Panel */
	.cell-info {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		background: rgba(192, 132, 252, 0.06);
		border: 1px solid rgba(192, 132, 252, 0.2);
		border-radius: 4px;
	}
	.cell-info-close {
		position: absolute;
		top: 3px;
		right: 5px;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		font-size: 13px;
		line-height: 1;
		padding: 0;
	}
	.cell-info-close:hover { color: rgba(255, 255, 255, 0.7); }
	.cell-info-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.cell-info-value {
		font-size: 11px;
		font-weight: 600;
		color: #c084fc;
		word-break: break-all;
	}
	.cell-info-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 9px;
		color: rgba(255, 255, 255, 0.55);
	}
	.cell-info-details strong {
		color: rgba(255, 255, 255, 0.8);
		font-weight: 600;
	}

	.file-picker {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.file-input-hidden {
		display: none;
	}
	.file-picker label {
		cursor: pointer;
	}

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
