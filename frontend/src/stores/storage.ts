import { create } from 'zustand';
import { StorageEngineWrapper, initStorageWasm } from '@/wasm/storage-engine';
import type {
  EngineConfig,
  BufferPoolSnapshot,
  DiskSnapshot,
  PageSnapshot,
  TableInfo,
  ColumnDef,
  ScanRow,
} from '@/wasm/storage-types';
import { parseCSV, inferColumnTypes } from '@/wasm/storage-types';

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

function randomValue(
  colType: string | { VarChar: number } | { Blob: number },
  nullable: boolean,
): unknown {
  if (nullable && Math.random() < 0.1) return null;

  if (typeof colType === 'object') {
    if ('VarChar' in colType) {
      const s = SAMPLE_STRINGS[Math.floor(Math.random() * SAMPLE_STRINGS.length)];
      return s.length > colType.VarChar ? s.slice(0, colType.VarChar) : s;
    }
    const len = Math.min(8, 'Blob' in colType ? colType.Blob : 8);
    const bytes = Array.from({ length: len }, () =>
      Math.floor(Math.random() * 256),
    );
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  switch (colType) {
    case 'Int32':
      return Math.floor(Math.random() * 2001) - 1000;
    case 'UInt32':
      return Math.floor(Math.random() * 10001);
    case 'Float64':
      return Math.round(Math.random() * 10000) / 100;
    case 'Bool':
      return Math.random() > 0.5;
    default:
      return 0;
  }
}

function coerceValue(
  raw: string,
  colType: string | { VarChar: number } | { Blob: number },
): unknown {
  if (raw === '') return null;
  if (typeof colType === 'object') return raw;
  switch (colType) {
    case 'Int32':
    case 'UInt32':
      return parseInt(raw, 10);
    case 'Float64':
      return parseFloat(raw);
    case 'Bool': {
      const lower = raw.toLowerCase();
      return lower === 'true' || lower === '1';
    }
    default:
      return raw;
  }
}

// ── Store types ────────────────────────────────────────────────────

interface StorageState {
  // Engine
  engine: StorageEngineWrapper | null;
  engineConfig: EngineConfig | null;
  wasmReady: boolean;
  engineReady: boolean;

  // Snapshots
  bpSnapshot: BufferPoolSnapshot | null;
  diskSnapshot: DiskSnapshot | null;
  pageSnapshot: PageSnapshot | null;
  selectedPageId: number | null;

  // Tables
  tables: string[];
  selectedTable: string | null;
  tableInfo: TableInfo | null;

  // Scan
  scanResults: ScanRow[];
  scanColumns: string[];

  // Selection
  selectedSlotId: number | null;
  selectedCell: { rowId: string; colIndex: number; value: unknown } | null;
  getRowResult: { rowId: string; values: unknown[] } | null;

  // Status
  statusMsg: string;
  statusType: 'info' | 'success' | 'error';

  // Actions
  initWasm: () => Promise<void>;
  initEngine: (config: EngineConfig) => void;
  resetEngine: () => void;
  createTable: (name: string, columns: ColumnDef[]) => void;
  dropTable: (name: string) => void;
  selectTable: (name: string) => void;
  insert: (tableName: string, values: unknown[]) => void;
  deleteRow: (tableName: string, rowId: string) => void;
  getRow: (tableName: string, rowId: string) => void;
  scan: (tableName: string) => void;
  selectPage: (pageId: number | null) => void;
  flushPage: (pageId: number) => void;
  flushAll: () => void;
  selectSlot: (slotId: number | null) => void;
  selectCell: (rowId: string, colIndex: number, value: unknown) => void;
  clearCellSelection: () => void;
  clearGetResult: () => void;
  selectRowFromScan: (rowId: string) => void;
  bootstrapTable: (name: string, columns: ColumnDef[], rowCount: number) => void;
  loadFromCSV: (tableName: string, headers: string[], rows: string[][], columns: ColumnDef[]) => void;
  refreshSnapshots: () => void;
}

// ── Store ──────────────────────────────────────────────────────────

export const useStorageStore = create<StorageState>((set, get) => {
  function refreshSnapshots() {
    const { engine, selectedPageId, selectedTable } = get();
    if (!engine) return;
    const bpSnapshot = engine.snapshotBufferPool();
    const diskSnapshot = engine.snapshotDisk();
    const pageSnapshot = selectedPageId !== null ? engine.snapshotPage(selectedPageId) : null;
    const tableInfo = selectedTable ? engine.snapshotTable(selectedTable) : null;
    set({ bpSnapshot, diskSnapshot, pageSnapshot, tableInfo });
  }

  function setStatus(statusMsg: string, statusType: 'info' | 'success' | 'error' = 'info') {
    set({ statusMsg, statusType });
  }

  return {
    engine: null,
    engineConfig: null,
    wasmReady: false,
    engineReady: false,
    bpSnapshot: null,
    diskSnapshot: null,
    pageSnapshot: null,
    selectedPageId: null,
    tables: [],
    selectedTable: null,
    tableInfo: null,
    scanResults: [],
    scanColumns: [],
    selectedSlotId: null,
    selectedCell: null,
    getRowResult: null,
    statusMsg: '',
    statusType: 'info',

    async initWasm() {
      await initStorageWasm();
      set({ wasmReady: true });
    },

    initEngine(config: EngineConfig) {
      const { engine: old } = get();
      if (old) old.destroy();
      const engine = new StorageEngineWrapper(config);
      set({
        engine,
        engineConfig: engine.config(),
        engineReady: true,
        tables: [],
        selectedTable: null,
        scanResults: [],
        scanColumns: [],
        tableInfo: null,
        selectedSlotId: null,
        selectedCell: null,
        getRowResult: null,
        selectedPageId: null,
        pageSnapshot: null,
      });
      refreshSnapshots();
      setStatus('Engine initialized', 'success');
    },

    resetEngine() {
      const { engine } = get();
      if (engine) engine.destroy();
      set({
        engine: null,
        engineConfig: null,
        engineReady: false,
        bpSnapshot: null,
        diskSnapshot: null,
        pageSnapshot: null,
        selectedPageId: null,
        tables: [],
        selectedTable: null,
        scanResults: [],
        scanColumns: [],
        tableInfo: null,
        selectedSlotId: null,
        selectedCell: null,
        getRowResult: null,
      });
      setStatus('Engine reset', 'info');
    },

    createTable(name: string, columns: ColumnDef[]) {
      const { engine, selectedTable } = get();
      if (!engine) return;
      try {
        engine.createTable(name, columns);
        const tables = engine.listTables();
        set({ tables, selectedTable: selectedTable ?? name });
        refreshSnapshots();
        setStatus(`Table '${name}' created`, 'success');
      } catch (e: unknown) {
        setStatus(String(e), 'error');
      }
    },

    dropTable(name: string) {
      const { engine, selectedTable } = get();
      if (!engine) return;
      engine.dropTable(name);
      const tables = engine.listTables();
      const newSelected = selectedTable === name
        ? (tables.length > 0 ? tables[0] : null)
        : selectedTable;
      set({
        tables,
        selectedTable: newSelected,
        scanResults: [],
        scanColumns: [],
        selectedSlotId: null,
        selectedCell: null,
        getRowResult: null,
        tableInfo: newSelected && engine ? engine.snapshotTable(newSelected) : null,
      });
      refreshSnapshots();
      setStatus(`Table '${name}' dropped`, 'success');
    },

    selectTable(name: string) {
      const { engine } = get();
      set({
        selectedTable: name,
        scanResults: [],
        scanColumns: [],
        selectedSlotId: null,
        selectedCell: null,
        getRowResult: null,
        tableInfo: engine ? engine.snapshotTable(name) : null,
      });
    },

    insert(tableName: string, values: unknown[]) {
      const { engine } = get();
      if (!engine) return;
      try {
        const rowId = engine.insert(tableName, values);
        refreshSnapshots();
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
      const { engine } = get();
      if (!engine) return;
      try {
        const ok = engine.delete(tableName, rowId);
        refreshSnapshots();
        setStatus(
          ok ? `Deleted row ${rowId} — slot tombstoned (space not yet reclaimed)` : 'Row not found',
          ok ? 'success' : 'error',
        );
      } catch (e: unknown) {
        setStatus(String(e), 'error');
      }
    },

    getRow(tableName: string, rowId: string) {
      const { engine, scanColumns: existingCols } = get();
      if (!engine) return;
      try {
        const values = engine.get(tableName, rowId);
        let scanColumns = existingCols;
        if (scanColumns.length === 0) {
          const schema = engine.tableSchema(tableName);
          scanColumns = schema ? schema.columns.map((c) => c.name) : [];
        }
        const parts = rowId.split(':');
        const updates: Partial<StorageState> = {
          getRowResult: { rowId, values },
          scanColumns,
        };
        if (parts.length === 2) {
          const pgId = parseInt(parts[0], 10);
          const slotIdx = parseInt(parts[1], 10);
          if (!isNaN(pgId) && !isNaN(slotIdx)) {
            updates.selectedPageId = pgId;
            updates.pageSnapshot = engine.snapshotPage(pgId);
            updates.selectedSlotId = slotIdx;
          }
        }
        set(updates);
        refreshSnapshots();
        setStatus(`Got row ${rowId}`, 'success');
      } catch (e: unknown) {
        set({ getRowResult: null });
        setStatus(String(e), 'error');
      }
    },

    scan(tableName: string) {
      const { engine } = get();
      if (!engine) return;
      try {
        const scanResults = engine.scan(tableName);
        const schema = engine.tableSchema(tableName);
        const scanColumns = schema ? schema.columns.map((c) => c.name) : [];
        set({ scanResults, scanColumns });
        refreshSnapshots();
        setStatus(`Scanned ${scanResults.length} rows`, 'success');
      } catch (e: unknown) {
        setStatus(String(e), 'error');
      }
    },

    selectPage(pageId: number | null) {
      const { engine } = get();
      set({
        selectedPageId: pageId,
        pageSnapshot: engine && pageId !== null ? engine.snapshotPage(pageId) : null,
      });
    },

    flushPage(pageId: number) {
      const { engine } = get();
      if (!engine) return;
      engine.flushPage(pageId);
      refreshSnapshots();
      setStatus(`Flushed page ${pageId}`, 'success');
    },

    flushAll() {
      const { engine } = get();
      if (!engine) return;
      engine.flushAll();
      refreshSnapshots();
      setStatus('Flushed all dirty pages', 'success');
    },

    selectSlot(slotId: number | null) {
      set({ selectedSlotId: slotId });
    },

    selectCell(rowId: string, colIndex: number, value: unknown) {
      const { engine } = get();
      const parts = rowId.split(':');
      const updates: Partial<StorageState> = {
        selectedCell: { rowId, colIndex, value },
      };
      if (parts.length === 2) {
        const pgId = parseInt(parts[0], 10);
        const slotIdx = parseInt(parts[1], 10);
        if (!isNaN(pgId) && !isNaN(slotIdx)) {
          updates.selectedPageId = pgId;
          updates.pageSnapshot = engine ? engine.snapshotPage(pgId) : null;
          updates.selectedSlotId = slotIdx;
        }
      }
      set(updates);
    },

    clearCellSelection() {
      set({ selectedCell: null });
    },

    clearGetResult() {
      set({ getRowResult: null, selectedCell: null });
    },

    selectRowFromScan(rowId: string) {
      const { engine } = get();
      const parts = rowId.split(':');
      if (parts.length !== 2) return;
      const pgId = parseInt(parts[0], 10);
      const slotIdx = parseInt(parts[1], 10);
      if (isNaN(pgId) || isNaN(slotIdx)) return;
      set({
        selectedPageId: pgId,
        pageSnapshot: engine ? engine.snapshotPage(pgId) : null,
        selectedSlotId: slotIdx,
      });
    },

    bootstrapTable(name: string, columns: ColumnDef[], rowCount: number) {
      const { engine, selectedTable } = get();
      if (!engine) return;
      try {
        engine.createTable(name, columns);
        const tables = engine.listTables();
        set({ tables, selectedTable: selectedTable ?? name });

        for (let i = 0; i < rowCount; i++) {
          const row = columns.map((c) => randomValue(c.type, c.nullable));
          engine.insert(name, row);
        }

        refreshSnapshots();
        setStatus(`Created '${name}' with ${rowCount} rows`, 'success');
      } catch (e: unknown) {
        setStatus(String(e), 'error');
      }
    },

    loadFromCSV(tableName: string, _headers: string[], rows: string[][], columns: ColumnDef[]) {
      const { engine, selectedTable } = get();
      if (!engine) return;
      try {
        engine.createTable(tableName, columns);
        const tables = engine.listTables();
        set({ tables, selectedTable: selectedTable ?? tableName });

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

    refreshSnapshots,
  };
});

// Re-export utilities for convenience
export { parseCSV, inferColumnTypes };
