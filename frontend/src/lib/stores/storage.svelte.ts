import { StorageEngineWrapper, initStorageWasm } from '$lib/wasm/storage-engine.js';
import type {
	EngineConfig,
	BufferPoolSnapshot,
	DiskSnapshot,
	PageSnapshot,
	ColumnDef,
	ScanRow,
} from '$lib/wasm/storage-types.js';

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
		refreshSnapshots();
		setStatus(`Table '${name}' dropped`, 'success');
	},

	selectTable(name: string) {
		selectedTable = name;
		scanResults = [];
	},

	insert(tableName: string, values: unknown[]) {
		if (!engine) return;
		try {
			const rowId = engine.insert(tableName, values);
			refreshSnapshots();
			setStatus(`Inserted row ${rowId}`, 'success');
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	deleteRow(tableName: string, rowId: string) {
		if (!engine) return;
		try {
			const ok = engine.delete(tableName, rowId);
			refreshSnapshots();
			setStatus(ok ? `Deleted row ${rowId}` : 'Row not found', ok ? 'success' : 'error');
		} catch (e: unknown) {
			setStatus(String(e), 'error');
		}
	},

	getRow(tableName: string, rowId: string): unknown[] | null {
		if (!engine) return null;
		try {
			return engine.get(tableName, rowId);
		} catch {
			return null;
		}
	},

	scan(tableName: string) {
		if (!engine) return;
		try {
			scanResults = engine.scan(tableName);
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

	refreshSnapshots,
};
