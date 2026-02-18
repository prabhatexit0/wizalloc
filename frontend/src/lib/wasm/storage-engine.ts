import init, { StorageEngine as WasmStorageEngine } from 'wizalloc-engine';
import wasmUrl from 'wizalloc-engine/wizalloc_engine_bg.wasm?url';
import {
	type EngineConfig,
	type BufferPoolSnapshot,
	type DiskSnapshot,
	type PageSnapshot,
	type TableInfo,
	type ScanRow,
	type ColumnDef,
	decodeBufferPool,
	decodeDisk,
	decodePage,
	decodeTable,
} from './storage-types.js';

let initialized = false;

export async function initStorageWasm(): Promise<void> {
	if (initialized) return;
	await init({ module_or_path: wasmUrl });
	initialized = true;
}

/** Thin wrapper around the WASM StorageEngine. */
export class StorageEngineWrapper {
	private inner: WasmStorageEngine;

	constructor(config: EngineConfig) {
		this.inner = new WasmStorageEngine(JSON.stringify(config));
	}

	config(): EngineConfig {
		return JSON.parse(this.inner.config());
	}

	createTable(name: string, columns: ColumnDef[]): void {
		const schema = JSON.stringify({ columns });
		this.inner.create_table(name, schema);
	}

	dropTable(name: string): boolean {
		return this.inner.drop_table(name);
	}

	listTables(): string[] {
		return JSON.parse(this.inner.list_tables());
	}

	insert(tableName: string, values: unknown[]): string {
		return this.inner.insert(tableName, JSON.stringify(values));
	}

	get(tableName: string, rowId: string): unknown[] {
		return JSON.parse(this.inner.get(tableName, rowId));
	}

	delete(tableName: string, rowId: string): boolean {
		return this.inner.delete(tableName, rowId);
	}

	scan(tableName: string): ScanRow[] {
		return JSON.parse(this.inner.scan(tableName));
	}

	flushAll(): void {
		this.inner.flush_all();
	}

	flushPage(pageId: number): boolean {
		return this.inner.flush_page(pageId);
	}

	tableSchema(tableName: string): { columns: ColumnDef[] } | null {
		const json = this.inner.table_schema(tableName);
		return json ? JSON.parse(json) : null;
	}

	// ── Snapshots ──────────────────────────────────────────────

	snapshotBufferPool(): BufferPoolSnapshot {
		return decodeBufferPool(this.inner.snapshot_buffer_pool());
	}

	snapshotDisk(): DiskSnapshot {
		return decodeDisk(this.inner.snapshot_disk());
	}

	snapshotPage(pageId: number): PageSnapshot | null {
		const data = this.inner.snapshot_page(pageId);
		return data ? decodePage(data) : null;
	}

	snapshotTable(tableName: string): TableInfo | null {
		const data = this.inner.snapshot_table(tableName);
		return data ? decodeTable(data) : null;
	}

	destroy(): void {
		this.inner.free();
	}
}
