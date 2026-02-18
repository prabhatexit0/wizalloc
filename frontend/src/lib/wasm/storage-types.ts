// ── Types for Storage Engine visualization ─────────────────────────

export const INVALID_PAGE = 0xFFFFFFFF;

export interface EngineConfig {
	page_size: number;
	pool_size: number;
	disk_capacity: number;
	overflow_threshold: number;
}

export interface FrameInfo {
	pageId: number | null; // null if empty
	pinCount: number;
	isDirty: boolean;
	isOccupied: boolean;
}

export interface BufferPoolSnapshot {
	poolSize: number;
	pageSize: number;
	frames: FrameInfo[];
	pageTable: Map<number, number>; // pageId → frameId
	lruOrder: number[];             // frameIds, front=LRU
	hitCount: number;
	missCount: number;
	diskReadCount: number;
	diskWriteCount: number;
	diskNumAllocated: number;
	diskMaxPages: number;
	diskBasePtr: number;
}

export interface DiskPageInfo {
	isAllocated: boolean;
	pageType: number; // 0=Data, 1=Overflow, 2=Free
}

export interface DiskSnapshot {
	maxPages: number;
	pageSize: number;
	numAllocated: number;
	diskBasePtr: number;
	pages: DiskPageInfo[];
}

export interface SlotInfo {
	offset: number;
	length: number;
}

export interface PageSnapshot {
	pageSize: number;
	pageId: number;
	pageType: number;
	slotCount: number;
	freeStart: number;
	freeEnd: number;
	nextPageId: number;
	freeSpace: number;
	slots: SlotInfo[];
	rawBytes: Uint8Array;
}

export interface ColumnDef {
	name: string;
	type: string | { VarChar: number } | { Blob: number };
	nullable: boolean;
}

export interface TableInfo {
	name: string;
	rowCount: number;
	firstPageId: number;
	columns: ColumnDef[];
	pageIds: number[];
}

export interface ScanRow {
	row_id: string;
	values: unknown[];
}

// ── Binary decoders ────────────────────────────────────────────────

class BinaryReader {
	private view: DataView;
	private offset = 0;

	constructor(data: Uint8Array) {
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}

	u8(): number { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
	u16(): number { const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
	u32(): number { const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
	u64(): bigint {
		const lo = this.view.getUint32(this.offset, true);
		const hi = this.view.getUint32(this.offset + 4, true);
		this.offset += 8;
		return BigInt(hi) * BigInt(0x100000000) + BigInt(lo);
	}
	bytes(n: number): Uint8Array {
		const slice = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, n);
		this.offset += n;
		return new Uint8Array(slice); // copy
	}
}

export function decodeBufferPool(data: Uint8Array): BufferPoolSnapshot {
	const r = new BinaryReader(data);
	const poolSize = r.u32();
	const pageSize = r.u32();

	const frames: FrameInfo[] = [];
	for (let i = 0; i < poolSize; i++) {
		const pid = r.u32();
		frames.push({
			pageId: pid === INVALID_PAGE ? null : pid,
			pinCount: r.u32(),
			isDirty: r.u8() !== 0,
			isOccupied: r.u8() !== 0,
		});
	}

	const ptLen = r.u32();
	const pageTable = new Map<number, number>();
	for (let i = 0; i < ptLen; i++) {
		pageTable.set(r.u32(), r.u32());
	}

	const lruLen = r.u32();
	const lruOrder: number[] = [];
	for (let i = 0; i < lruLen; i++) {
		lruOrder.push(r.u32());
	}

	return {
		poolSize, pageSize, frames, pageTable, lruOrder,
		hitCount: Number(r.u64()),
		missCount: Number(r.u64()),
		diskReadCount: Number(r.u64()),
		diskWriteCount: Number(r.u64()),
		diskNumAllocated: r.u32(),
		diskMaxPages: r.u32(),
		diskBasePtr: r.u32(),
	};
}

export function decodeDisk(data: Uint8Array): DiskSnapshot {
	const r = new BinaryReader(data);
	const maxPages = r.u32();
	const pageSize = r.u32();
	const numAllocated = r.u32();
	const diskBasePtr = r.u32();

	const pages: DiskPageInfo[] = [];
	for (let i = 0; i < maxPages; i++) {
		pages.push({
			isAllocated: r.u8() !== 0,
			pageType: r.u8(),
		});
	}

	return { maxPages, pageSize, numAllocated, diskBasePtr, pages };
}

export function decodePage(data: Uint8Array): PageSnapshot {
	const r = new BinaryReader(data);
	const pageSize = r.u32();
	const pageId = r.u32();
	const pageType = r.u8();
	const slotCount = r.u16();
	const freeStart = r.u16();
	const freeEnd = r.u16();
	const nextPageId = r.u32();
	const freeSpace = r.u16();

	const numSlots = r.u16();
	const slots: SlotInfo[] = [];
	for (let i = 0; i < numSlots; i++) {
		slots.push({ offset: r.u16(), length: r.u16() });
	}

	const rawBytes = r.bytes(pageSize);

	return { pageSize, pageId, pageType, slotCount, freeStart, freeEnd, nextPageId, freeSpace, slots, rawBytes };
}

export function decodeTable(data: Uint8Array): TableInfo {
	const r = new BinaryReader(data);

	const nameLen = r.u16();
	const nameBytes = r.bytes(nameLen);
	const name = new TextDecoder().decode(nameBytes);

	const rowCount = r.u32();
	const firstPageId = r.u32();

	const numCols = r.u16();
	const columns: ColumnDef[] = [];
	for (let i = 0; i < numCols; i++) {
		const cnLen = r.u16();
		const cnBytes = r.bytes(cnLen);
		const colName = new TextDecoder().decode(cnBytes);
		const typeTag = r.u8();
		const nullable = r.u8() !== 0;
		const maxLen = r.u16();

		let type_: string | { VarChar: number } | { Blob: number };
		switch (typeTag) {
			case 0: type_ = 'Int32'; break;
			case 1: type_ = 'UInt32'; break;
			case 2: type_ = 'Float64'; break;
			case 3: type_ = 'Bool'; break;
			case 4: type_ = { VarChar: maxLen }; break;
			case 5: type_ = { Blob: maxLen }; break;
			default: type_ = 'Int32';
		}
		columns.push({ name: colName, type: type_, nullable });
	}

	const pageCount = r.u32();
	const pageIds: number[] = [];
	for (let i = 0; i < pageCount; i++) {
		pageIds.push(r.u32());
	}

	return { name, rowCount, firstPageId, columns, pageIds };
}

// ── Utility ────────────────────────────────────────────────────────

export function pageTypeName(t: number): string {
	switch (t) {
		case 0: return 'Data';
		case 1: return 'Overflow';
		case 2: return 'Free';
		default: return '?';
	}
}

export function formatHex(n: number): string {
	return '0x' + n.toString(16).toUpperCase().padStart(4, '0');
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	return `${(n / 1024).toFixed(1)}KB`;
}
