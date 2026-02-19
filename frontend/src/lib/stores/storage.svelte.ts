import { StorageEngineWrapper, initStorageWasm } from '$lib/wasm/storage-engine.js';
import type {
	EngineConfig,
	BufferPoolSnapshot,
	DiskSnapshot,
	PageSnapshot,
	TableInfo,
	ColumnDef,
	ScanRow,
} from '$lib/wasm/storage-types.js';
import { formatBytes, parseCSV, inferColumnTypes } from '$lib/wasm/storage-types.js';

// ── Reactive state using Svelte 5 runes ────────────────────────────

let engine: StorageEngineWrapper | null = $state(null);
let engineConfig: EngineConfig | null = $state(null);
let bpSnapshot: BufferPoolSnapshot | null = $state(null);
let diskSnap: DiskSnapshot | null = $state(null);
let selectedPageId: number | null = $state(null);
let pageSnap: PageSnapshot | null = $state(null);
let tables: string[] = $state([]);
let selectedTable: string | null = $state(null);
let scanResults: ScanRow[] = $state([]);
let scanColumns: string[] = $state([]);
let tableInfo: TableInfo | null = $state(null);
let selectedSlotId: number | null = $state(null);
let selectedCell: { rowId: string; colIndex: number; value: unknown } | null = $state(null);
let getRowResult: { rowId: string; values: unknown[] } | null = $state(null);
let statusMsg: string = $state('');
let statusType: 'info' | 'success' | 'error' = $state('info');
let wasmReady = $state(false);
let engineReady = $state(false);

function refreshSnapshots() {
	if (!engine) return;
	bpSnapshot = engine.snapshotBufferPool();
	diskSnap = engine.snapshotDisk();
	if (selectedPageId !== null) {
		pageSnap = engine.snapshotPage(selectedPageId);
	}
	if (selectedTable) {
		tableInfo = engine.snapshotTable(selectedTable);
	}
}

function setStatus(msg: string, type: 'info' | 'success' | 'error' = 'info') {
	statusMsg = msg;
	statusType = type;
}

// ── Random data generation helpers ─────────────────────────────────

const SAMPLE_NAMES = [
	'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
	'Ivy', 'Jack', 'Karen', 'Leo', 'Mona', 'Nate', 'Olivia', 'Pete',
	'Quinn', 'Rose', 'Sam', 'Tina', 'Uma', 'Vince', 'Wendy', 'Xander',
];

const SAMPLE_EMAILS = [
	'alice@example.com', 'bob@test.org', 'charlie@mail.co', 'diana@work.net',
	'eve@inbox.io', 'frank@demo.dev', 'grace@site.com', 'hank@corp.biz',
	'ivy@web.app', 'jack@hello.org', 'karen@data.io', 'leo@tech.co',
];

const SAMPLE_CITIES = [
	'New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney',
	'Toronto', 'Mumbai', 'Seoul', 'Dubai', 'Oslo', 'Lima',
];

const SAMPLE_STRINGS = [...SAMPLE_NAMES, ...SAMPLE_EMAILS, ...SAMPLE_CITIES];

function randomValue(colType: string | { VarChar: number } | { Blob: number }, nullable: boolean): unknown {
	if (nullable && Math.random() < 0.1) return null;

	if (typeof colType === 'object') {
		if ('VarChar' in colType) {
			const s = SAMPLE_STRINGS[Math.floor(Math.random() * SAMPLE_STRINGS.length)];
			return s.length > colType.VarChar ? s.slice(0, colType.VarChar) : s;
		}
		// Blob — small random hex string
		const len = Math.min(8, ('Blob' in colType ? colType.Blob : 8));
		const bytes = Array.from({ length: len }, () => Math.floor(Math.random() * 256));
		return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
	}

	switch (colType) {
		case 'Int32':  return Math.floor(Math.random() * 2001) - 1000;
		case 'UInt32': return Math.floor(Math.random() * 10001);
		case 'Float64': return Math.round(Math.random() * 10000) / 100;
		case 'Bool':   return Math.random() > 0.5;
		default:       return 0;
	}
}

function coerceValue(raw: string, colType: string | { VarChar: number } | { Blob: number }): unknown {
	if (raw === '') return null;
	if (typeof colType === 'object') return raw; // VarChar / Blob → string as-is
	switch (colType) {
		case 'Int32': case 'UInt32': return parseInt(raw, 10);
		case 'Float64': return parseFloat(raw);
		case 'Bool': {
			const lower = raw.toLowerCase();
			return lower === 'true' || lower === '1';
		}
		default: return raw;
	}
}

// ── Public API ─────────────────────────────────────────────────────

export const storageState = {
	get engine() { return engine; },
	get config() { return engineConfig; },
	get bpSnapshot() { return bpSnapshot; },
	get diskSnapshot() { return diskSnap; },
	get selectedPageId() { return selectedPageId; },
	get pageSnapshot() { return pageSnap; },
	get tables() { return tables; },
	get selectedTable() { return selectedTable; },
	get scanResults() { return scanResults; },
	get scanColumns() { return scanColumns; },
	get tableInfo() { return tableInfo; },
	get selectedSlotId() { return selectedSlotId; },
	get selectedCell() { return selectedCell; },
	get getRowResult() { return getRowResult; },
	get statusMsg() { return statusMsg; },
	get statusType() { return statusType; },
	get wasmReady() { return wasmReady; },
	get engineReady() { return engineReady; },

	async initWasm() {
		await initStorageWasm();
		wasmReady = true;
	},

	initEngine(config: EngineConfig) {
		if (engine) {
			engine.destroy();
		}
		engine = new StorageEngineWrapper(config);
		engineConfig = engine.config();
		engineReady = true;
		tables = [];
		selectedTable = null;
		scanResults = [];
		scanColumns = [];
		tableInfo = null;
		selectedSlotId = null;
		selectedCell = null;
		getRowResult = null;
		selectedPageId = null;
		pageSnap = null;
		refreshSnapshots();
		setStatus('Engine initialized', 'success');
	},

	resetEngine() {
		if (engine) {
			engine.destroy();
			engine = null;
		}
		engineConfig = null;
		engineReady = false;
		bpSnapshot = null;
		diskSnap = null;
		pageSnap = null;
		selectedPageId = null;
		tables = [];
		selectedTable = null;
		scanResults = [];
		scanColumns = [];
		tableInfo = null;
		selectedSlotId = null;
		selectedCell = null;
		getRowResult = null;
		setStatus('Engine reset', 'info');
	},

	createTable(name: string, columns: ColumnDef[]) {
		if (!engine) return;
		try {
			engine.createTable(name, columns);
			tables = engine.listTables();
			if (!selectedTable) selectedTable = name;
			refreshSnapshots();
			setStatus(`Table '${name}' created`, 'success');
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	dropTable(name: string) {
		if (!engine) return;
		engine.dropTable(name);
		tables = engine.listTables();
		if (selectedTable === name) {
			selectedTable = tables.length > 0 ? tables[0] : null;
		}
		scanResults = [];
		scanColumns = [];
		tableInfo = selectedTable && engine ? engine.snapshotTable(selectedTable) : null;
		selectedSlotId = null;
		selectedCell = null;
		getRowResult = null;
		refreshSnapshots();
		setStatus(`Table '${name}' dropped`, 'success');
	},

	selectTable(name: string) {
		selectedTable = name;
		scanResults = [];
		scanColumns = [];
		selectedSlotId = null;
		selectedCell = null;
		getRowResult = null;
		if (engine) {
			tableInfo = engine.snapshotTable(name);
		}
	},

	insert(tableName: string, values: unknown[]) {
		if (!engine) return;
		try {
			const rowId = engine.insert(tableName, values);
			refreshSnapshots();
			// Richer status: show page info if available
			const parts = rowId.split(':');
			const pgId = parseInt(parts[0], 10);
			const snap = engine.snapshotPage(pgId);
			if (snap) {
				setStatus(`Inserted row ${rowId} on Page ${pgId} (${snap.freeSpace}B free remaining)`, 'success');
			} else {
				setStatus(`Inserted row ${rowId}`, 'success');
			}
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	deleteRow(tableName: string, rowId: string) {
		if (!engine) return;
		try {
			const ok = engine.delete(tableName, rowId);
			refreshSnapshots();
			setStatus(
				ok ? `Deleted row ${rowId} — slot tombstoned (space not yet reclaimed)` : 'Row not found',
				ok ? 'success' : 'error'
			);
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	getRow(tableName: string, rowId: string) {
		if (!engine) return;
		try {
			const values = engine.get(tableName, rowId);
			getRowResult = { rowId, values };
			// Ensure column names are available
			if (scanColumns.length === 0) {
				const schema = engine.tableSchema(tableName);
				scanColumns = schema ? schema.columns.map(c => c.name) : [];
			}
			// Also navigate to its page/slot
			const parts = rowId.split(':');
			if (parts.length === 2) {
				const pgId = parseInt(parts[0], 10);
				const slotIdx = parseInt(parts[1], 10);
				if (!isNaN(pgId) && !isNaN(slotIdx)) {
					selectedPageId = pgId;
					pageSnap = engine.snapshotPage(pgId);
					selectedSlotId = slotIdx;
				}
			}
			refreshSnapshots();
			setStatus(`Got row ${rowId}`, 'success');
		} catch (e: unknown) {
			getRowResult = null;
			setStatus(String(e), 'error');
		}
	},

	selectCell(rowId: string, colIndex: number, value: unknown) {
		selectedCell = { rowId, colIndex, value };
		// Also navigate to the row's page/slot
		const parts = rowId.split(':');
		if (parts.length === 2) {
			const pgId = parseInt(parts[0], 10);
			const slotIdx = parseInt(parts[1], 10);
			if (!isNaN(pgId) && !isNaN(slotIdx)) {
				selectedPageId = pgId;
				if (engine) {
					pageSnap = engine.snapshotPage(pgId);
				}
				selectedSlotId = slotIdx;
			}
		}
	},

	clearCellSelection() {
		selectedCell = null;
	},

	clearGetResult() {
		getRowResult = null;
		selectedCell = null;
	},

	scan(tableName: string) {
		if (!engine) return;
		try {
			scanResults = engine.scan(tableName);
			const schema = engine.tableSchema(tableName);
			scanColumns = schema ? schema.columns.map(c => c.name) : [];
			refreshSnapshots();
			setStatus(`Scanned ${scanResults.length} rows`, 'success');
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	selectPage(pageId: number | null) {
		selectedPageId = pageId;
		if (engine && pageId !== null) {
			pageSnap = engine.snapshotPage(pageId);
		} else {
			pageSnap = null;
		}
	},

	flushPage(pageId: number) {
		if (!engine) return;
		engine.flushPage(pageId);
		refreshSnapshots();
		setStatus(`Flushed page ${pageId}`, 'success');
	},

	selectSlot(slotId: number | null) {
		selectedSlotId = slotId;
	},

	selectRowFromScan(rowId: string) {
		// rowId is in "pageId:slotId" format
		const parts = rowId.split(':');
		if (parts.length !== 2) return;
		const pgId = parseInt(parts[0], 10);
		const slotIdx = parseInt(parts[1], 10);
		if (isNaN(pgId) || isNaN(slotIdx)) return;

		// Select the page and slot
		selectedPageId = pgId;
		if (engine) {
			pageSnap = engine.snapshotPage(pgId);
		}
		selectedSlotId = slotIdx;
	},

	flushAll() {
		if (!engine) return;
		engine.flushAll();
		refreshSnapshots();
		setStatus('Flushed all dirty pages', 'success');
	},

	bootstrapTable(name: string, columns: ColumnDef[], rowCount: number) {
		if (!engine) return;
		try {
			// Build typed column defs for the engine
			engine.createTable(name, columns);
			tables = engine.listTables();
			if (!selectedTable) selectedTable = name;

			for (let i = 0; i < rowCount; i++) {
				const row = columns.map(c => randomValue(c.type, c.nullable));
				engine.insert(name, row);
			}

			refreshSnapshots();
			setStatus(`Created '${name}' with ${rowCount} rows`, 'success');
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	loadFromCSV(tableName: string, headers: string[], rows: string[][], columns: ColumnDef[]) {
		if (!engine) return;
		try {
			engine.createTable(tableName, columns);
			tables = engine.listTables();
			if (!selectedTable) selectedTable = tableName;

			for (const row of rows) {
				const values = columns.map((col, i) => {
					const raw = i < row.length ? row[i] : '';
					return raw === '' && col.nullable ? null : coerceValue(raw, col.type);
				});
				engine.insert(tableName, values);
			}

			refreshSnapshots();
			setStatus(`Loaded '${tableName}' with ${rows.length} rows from CSV`, 'success');
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	parseCSV,
	inferColumnTypes,
	refreshSnapshots,
};
