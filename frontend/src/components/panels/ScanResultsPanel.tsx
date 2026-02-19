import { useState, useMemo } from 'react';
import { useStorageStore } from '@/stores/storage';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import { CellInfoView } from './TableOperationsPanel';

interface ScanResultsPanelProps {
  open: boolean;
  onToggle: () => void;
}

export default function ScanResultsPanel({ open, onToggle }: ScanResultsPanelProps) {
  const scanResults = useStorageStore((s) => s.scanResults);
  const scanColumns = useStorageStore((s) => s.scanColumns);
  const selectedSlotId = useStorageStore((s) => s.selectedSlotId);
  const selectedPageId = useStorageStore((s) => s.selectedPageId);
  const selectedCell = useStorageStore((s) => s.selectedCell);
  const selectCell = useStorageStore((s) => s.selectCell);
  const clearCellSelection = useStorageStore((s) => s.clearCellSelection);
  const selectRowFromScan = useStorageStore((s) => s.selectRowFromScan);
  const tableInfo = useStorageStore((s) => s.tableInfo);
  const pageSnapshot = useStorageStore((s) => s.pageSnapshot);

  const [filterText, setFilterText] = useState('');

  const filteredResults = useMemo(() => {
    if (!filterText.trim()) return scanResults;
    const q = filterText.trim().toLowerCase();
    return scanResults.filter((row) => {
      if (row.row_id.toLowerCase().includes(q)) return true;
      return row.values.some((v) => String(v ?? 'NULL').toLowerCase().includes(q));
    });
  }, [scanResults, filterText]);

  if (scanResults.length === 0) return null;

  const columns = scanColumns.length > 0 ? scanColumns : (scanResults[0]?.values ?? []).map((_, i) => `col${i}`);

  function handleRowClick(rowId: string) {
    clearCellSelection();
    selectRowFromScan(rowId);
  }

  function handleCellClick(e: React.MouseEvent, rowId: string, colIndex: number, value: unknown) {
    e.stopPropagation();
    selectCell(rowId, colIndex, value);
  }

  function isRowSelected(rowId: string) {
    if (selectedSlotId === null) return false;
    const parts = rowId.split(':');
    return parseInt(parts[0], 10) === selectedPageId && parseInt(parts[1], 10) === selectedSlotId;
  }

  const badge = filteredResults.length === scanResults.length
    ? String(scanResults.length)
    : `${filteredResults.length}/${scanResults.length}`;

  return (
    <CollapsibleSection
      title="Scan Results"
      open={open}
      onToggle={onToggle}
      badge={badge}
      description="Click any row to see which page it lives on and inspect its memory layout"
    >
      {/* Filter */}
      <div className="flex flex-col gap-0.5">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter rows..."
          className="w-full bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[10px] outline-none focus:border-[#007acc]"
        />
        {filterText.trim() && (
          <span className="text-[9px] text-white/40">
            Showing {filteredResults.length} of {scanResults.length} rows
          </span>
        )}
      </div>

      {/* Results table */}
      <div className="overflow-auto max-h-50">
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
            {filteredResults.map((row) => {
              const rowSelected = isRowSelected(row.row_id);
              return (
                <tr
                  key={row.row_id}
                  className={`cursor-pointer hover:bg-white/[0.05] ${
                    rowSelected ? 'bg-cyan-400/[0.08] outline outline-1 outline-cyan-400/20' : ''
                  }`}
                  onClick={() => handleRowClick(row.row_id)}
                >
                  <td className="p-0.5 px-1.5 border border-white/[0.06] text-left whitespace-nowrap text-blue-400">
                    {row.row_id}
                  </td>
                  {row.values.map((val, colIdx) => (
                    <td
                      key={colIdx}
                      className={`p-0.5 px-1.5 border border-white/[0.06] text-left whitespace-nowrap cursor-pointer transition-colors hover:bg-purple-400/12 ${
                        selectedCell?.rowId === row.row_id && selectedCell?.colIndex === colIdx
                          ? 'bg-purple-400/18 outline outline-1 outline-purple-400/40'
                          : ''
                      }`}
                      onClick={(e) => handleCellClick(e, row.row_id, colIdx, val)}
                    >
                      {val === null ? 'NULL' : String(val)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cell info */}
      {selectedCell && tableInfo && (
        <CellInfoView
          cell={selectedCell}
          tableInfo={tableInfo}
          pageSnapshot={pageSnapshot}
          onClose={clearCellSelection}
        />
      )}
    </CollapsibleSection>
  );
}
