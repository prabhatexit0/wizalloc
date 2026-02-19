import { useState } from 'react';
import { useStorageStore } from '@/stores/storage';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import { formatColType, formatBytes } from '@/wasm/storage-types';

interface TableOperationsPanelProps {
  open: boolean;
  onToggle: () => void;
}

export default function TableOperationsPanel({ open, onToggle }: TableOperationsPanelProps) {
  const tables = useStorageStore((s) => s.tables);
  const selectedTable = useStorageStore((s) => s.selectedTable);
  const selectTable = useStorageStore((s) => s.selectTable);
  const insert = useStorageStore((s) => s.insert);
  const deleteRow = useStorageStore((s) => s.deleteRow);
  const getRow = useStorageStore((s) => s.getRow);
  const scan = useStorageStore((s) => s.scan);
  const flushAll = useStorageStore((s) => s.flushAll);
  const dropTable = useStorageStore((s) => s.dropTable);
  const selectPage = useStorageStore((s) => s.selectPage);
  const selectedPageId = useStorageStore((s) => s.selectedPageId);
  const tableInfo = useStorageStore((s) => s.tableInfo);
  const engineConfig = useStorageStore((s) => s.engineConfig);
  const getRowResult = useStorageStore((s) => s.getRowResult);
  const clearGetResult = useStorageStore((s) => s.clearGetResult);
  const scanColumns = useStorageStore((s) => s.scanColumns);
  const selectedCell = useStorageStore((s) => s.selectedCell);
  const selectCell = useStorageStore((s) => s.selectCell);
  const clearCellSelection = useStorageStore((s) => s.clearCellSelection);
  const pageSnapshot = useStorageStore((s) => s.pageSnapshot);

  const [insertValues, setInsertValues] = useState('');
  const [rowIdInput, setRowIdInput] = useState('');

  function doInsert() {
    if (!selectedTable || !insertValues.trim()) return;
    try {
      const vals = JSON.parse(`[${insertValues}]`);
      insert(selectedTable, vals);
      setInsertValues('');
    } catch {
      insert(selectedTable, []);
    }
  }

  function doGet() {
    if (!selectedTable || !rowIdInput.trim()) return;
    getRow(selectedTable, rowIdInput.trim());
  }

  function doDelete() {
    if (!selectedTable || !rowIdInput.trim()) return;
    deleteRow(selectedTable, rowIdInput.trim());
  }

  function doScan() {
    if (!selectedTable) return;
    scan(selectedTable);
  }

  if (tables.length === 0) return null;

  return (
    <CollapsibleSection
      title="Table"
      open={open}
      onToggle={onToggle}
      description="Insert, delete, and scan rows. Row IDs are in page:slot format"
    >
      {/* Table tabs */}
      <div className="flex gap-0.5 flex-wrap">
        {tables.map((t) => (
          <button
            key={t}
            className={`px-2 py-0.5 border rounded text-[10px] font-mono cursor-pointer ${
              selectedTable === t
                ? 'bg-[#007acc] text-white border-[#007acc]'
                : 'bg-transparent text-white/50 border-white/10 hover:bg-white/[0.06]'
            }`}
            onClick={() => selectTable(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {selectedTable && (
        <>
          {/* Table Info */}
          {tableInfo && (
            <div className="flex flex-col gap-1 p-1.5 bg-white/[0.02] border border-white/[0.06] rounded">
              <div className="flex flex-wrap gap-0.5">
                {tableInfo.columns.map((col, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1.5 py-px rounded bg-blue-400/10 text-blue-400/80 border border-blue-400/15"
                  >
                    {col.name}: {formatColType(col.type)}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-white/50">
                <span>{tableInfo.rowCount} rows</span>
                <span className="text-white/30">&middot;</span>
                <span>{tableInfo.pageIds.length} pages</span>
                <span className="text-white/30">&middot;</span>
                <span>{formatBytes(tableInfo.pageIds.length * (engineConfig?.page_size ?? 0))}</span>
              </div>
              {tableInfo.pageIds.length > 0 && (
                <div className="flex items-center gap-0.5 flex-wrap">
                  {tableInfo.pageIds.map((pgId, i) => (
                    <span key={pgId} className="contents">
                      <button
                        className={`text-[9px] px-1.5 py-px rounded font-mono cursor-pointer border ${
                          selectedPageId === pgId
                            ? 'bg-purple-400/15 border-purple-400/30 text-purple-400'
                            : 'bg-green-400/[0.08] border-green-400/15 text-green-400/70 hover:bg-green-400/15 hover:text-green-400/90'
                        }`}
                        onClick={() => selectPage(pgId)}
                      >
                        Pg {pgId}
                      </button>
                      {i < tableInfo.pageIds.length - 1 && (
                        <span className="text-[9px] text-white/25">&rarr;</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Insert */}
          <span className="text-[10px] text-white/50">Insert Row</span>
          <div className="flex gap-1">
            <input
              type="text"
              value={insertValues}
              onChange={(e) => setInsertValues(e.target.value)}
              placeholder='42, "Alice", 3.14, true'
              className="flex-1 bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
              onKeyDown={(e) => e.key === 'Enter' && doInsert()}
            />
            <button
              className="px-2 py-0.5 border border-[#007acc] rounded bg-[#007acc] text-white cursor-pointer font-mono text-[10px] hover:bg-[#005f99]"
              onClick={doInsert}
            >
              Insert
            </button>
          </div>

          {/* Get / Delete */}
          <span className="text-[10px] text-white/50">Row ID</span>
          <div className="flex gap-1">
            <input
              type="text"
              value={rowIdInput}
              onChange={(e) => setRowIdInput(e.target.value)}
              placeholder="0:0"
              className="bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
              onKeyDown={(e) => e.key === 'Enter' && doGet()}
            />
            <button
              className="px-2 py-0.5 border border-white/15 rounded bg-white/[0.06] text-white/80 cursor-pointer font-mono text-[10px] hover:bg-white/12"
              onClick={doGet}
            >
              Get
            </button>
            <button
              className="px-2 py-0.5 border border-red-400/30 rounded bg-red-400/20 text-red-400 cursor-pointer font-mono text-[10px] hover:bg-red-400/30"
              onClick={doDelete}
            >
              Delete
            </button>
          </div>

          {/* Get Row Result */}
          {getRowResult && (
            <GetRowResultView
              result={getRowResult}
              scanColumns={scanColumns}
              selectedCell={selectedCell}
              selectCell={selectCell}
              clearCellSelection={clearCellSelection}
              clearGetResult={clearGetResult}
              tableInfo={tableInfo}
              pageSnapshot={pageSnapshot}
            />
          )}

          {/* Actions */}
          <div className="flex gap-1">
            <button
              className="px-2 py-0.5 border border-white/15 rounded bg-white/[0.06] text-white/80 cursor-pointer font-mono text-[10px] hover:bg-white/12"
              onClick={doScan}
            >
              Scan Table
            </button>
            <button
              className="px-2 py-0.5 border border-white/15 rounded bg-white/[0.06] text-white/80 cursor-pointer font-mono text-[10px] hover:bg-white/12"
              onClick={() => flushAll()}
            >
              Flush All
            </button>
            <button
              className="px-2 py-0.5 border border-red-400/30 rounded bg-red-400/20 text-red-400 cursor-pointer font-mono text-[10px] hover:bg-red-400/30"
              onClick={() => dropTable(selectedTable)}
            >
              Drop
            </button>
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

// ── Get Row Result sub-component ──

function GetRowResultView({
  result,
  scanColumns,
  selectedCell,
  selectCell,
  clearCellSelection,
  clearGetResult,
  tableInfo,
  pageSnapshot,
}: {
  result: { rowId: string; values: unknown[] };
  scanColumns: string[];
  selectedCell: { rowId: string; colIndex: number; value: unknown } | null;
  selectCell: (rowId: string, colIndex: number, value: unknown) => void;
  clearCellSelection: () => void;
  clearGetResult: () => void;
  tableInfo: import('@/wasm/storage-types').TableInfo | null;
  pageSnapshot: import('@/wasm/storage-types').PageSnapshot | null;
}) {
  const columns = scanColumns.length > 0 ? scanColumns : result.values.map((_, i) => `col${i}`);

  return (
    <div className="flex flex-col gap-1 p-1.5 bg-blue-400/[0.04] border border-blue-400/15 rounded">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-blue-400 font-semibold">Row {result.rowId}</span>
        <button
          className="bg-transparent border-0 text-white/30 cursor-pointer text-xs px-0.5 hover:text-white/60"
          onClick={clearGetResult}
        >
          &times;
        </button>
      </div>
      <div className="overflow-auto max-h-15">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="p-0.5 px-1.5 border border-white/[0.06] text-left bg-[#2a2a2a] text-white/80 sticky top-0 z-[1] font-semibold whitespace-nowrap">
                RowID
              </th>
              {columns.map((colName) => (
                <th key={colName} className="p-0.5 px-1.5 border border-white/[0.06] text-left bg-[#2a2a2a] text-white/80 sticky top-0 z-[1] font-semibold whitespace-nowrap">
                  {colName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="cursor-pointer bg-cyan-400/[0.08] outline outline-1 outline-cyan-400/20">
              <td className="p-0.5 px-1.5 border border-white/[0.06] text-left whitespace-nowrap text-blue-400">
                {result.rowId}
              </td>
              {result.values.map((val, colIdx) => (
                <td
                  key={colIdx}
                  className={`p-0.5 px-1.5 border border-white/[0.06] text-left whitespace-nowrap cursor-pointer transition-colors hover:bg-purple-400/12 ${
                    selectedCell?.rowId === result.rowId && selectedCell?.colIndex === colIdx
                      ? 'bg-purple-400/18 outline outline-1 outline-purple-400/40'
                      : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectCell(result.rowId, colIdx, val);
                  }}
                >
                  {val === null ? 'NULL' : String(val)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {selectedCell && selectedCell.rowId === result.rowId && tableInfo && (
        <CellInfoView
          cell={selectedCell}
          tableInfo={tableInfo}
          pageSnapshot={pageSnapshot}
          onClose={clearCellSelection}
        />
      )}
    </div>
  );
}

// ── Cell Info sub-component (shared by scan results and get result) ──

import { estimateByteSize, colTypeName } from '@/wasm/storage-types';
import type { TableInfo, PageSnapshot } from '@/wasm/storage-types';

export function CellInfoView({
  cell,
  tableInfo,
  pageSnapshot,
  onClose,
}: {
  cell: { rowId: string; colIndex: number; value: unknown };
  tableInfo: TableInfo;
  pageSnapshot: PageSnapshot | null;
  onClose: () => void;
}) {
  const col = tableInfo.columns[cell.colIndex];
  const parts = cell.rowId.split(':');
  const pgId = parseInt(parts[0], 10);
  const slotIdx = parseInt(parts[1], 10);
  const byteSize = col ? estimateByteSize(col.type, cell.value) : 0;
  const slot = pageSnapshot && slotIdx < pageSnapshot.slots.length ? pageSnapshot.slots[slotIdx] : null;

  return (
    <div className="relative flex flex-col gap-1 p-1.5 px-2 bg-purple-400/[0.06] border border-purple-400/20 rounded">
      <button
        className="absolute top-0.5 right-1 bg-transparent border-0 text-white/40 cursor-pointer text-sm leading-none p-0 hover:text-white/70"
        onClick={onClose}
      >
        &times;
      </button>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-purple-400 break-all">
          &quot;{cell.value === null ? 'NULL' : String(cell.value)}&quot;
        </span>
      </div>
      <div className="flex flex-col gap-0.5 text-[9px] text-white/55">
        {col && (
          <>
            <span>
              Column: <strong className="text-white/80 font-semibold">{col.name}</strong> ({formatColType(col.type)})
            </span>
            <span>
              Encoded size: ~{byteSize}B as {colTypeName(col.type)}
              {typeof col.type === 'object' && 'VarChar' in col.type ? ` (2B len + ${byteSize - 2}B UTF-8)` : ''}
            </span>
          </>
        )}
        <span>
          Location: Page {pgId}, Slot [{slotIdx}]
          {slot && slot.length > 0 ? `, tuple offset ${slot.offset}, ${slot.length}B total` : ''}
        </span>
        {col && (
          <span>
            Field offset in tuple: ~byte{' '}
            {tableInfo.columns
              .slice(0, cell.colIndex)
              .reduce((acc, c) => acc + estimateByteSize(c.type, null), 0)}
          </span>
        )}
      </div>
    </div>
  );
}
