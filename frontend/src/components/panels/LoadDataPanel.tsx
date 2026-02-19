import { useState, useCallback } from 'react';
import { useStorageStore } from '@/stores/storage';
import { parseCSV, inferColumnTypes } from '@/stores/storage';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import { formatColType } from '@/wasm/storage-types';
import type { ColumnDef } from '@/wasm/storage-types';

interface LoadDataPanelProps {
  open: boolean;
  onToggle: () => void;
}

export default function LoadDataPanel({ open, onToggle }: LoadDataPanelProps) {
  const loadFromCSV = useStorageStore((s) => s.loadFromCSV);
  const [tableName, setTableName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setParsed(false);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const { headers: h, rows: r } = parseCSV(text);
        if (h.length === 0) {
          setError('No columns found in CSV');
          return;
        }
        setHeaders(h);
        setRows(r);
        setColumns(inferColumnTypes(h, r));
        setParsed(true);

        if (!tableName.trim()) {
          setTableName(file.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9_]/g, '_'));
        }
      } catch (e) {
        setError(String(e));
      }
    };
    reader.readAsText(file);
  }, [tableName]);

  function handleLoad() {
    if (!tableName.trim() || !parsed) return;
    loadFromCSV(tableName.trim(), headers, rows, columns);
    setTableName('');
    setHeaders([]);
    setRows([]);
    setColumns([]);
    setParsed(false);
    setError('');
  }

  return (
    <CollapsibleSection
      title="Load Data"
      open={open}
      onToggle={onToggle}
      description="Upload a CSV file to create a table with auto-inferred column types"
    >
      <input
        type="text"
        value={tableName}
        onChange={(e) => setTableName(e.target.value)}
        placeholder="Table name"
        className="w-full bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
      />
      <div className="flex items-center gap-1.5">
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelect}
          id="csv-file-input"
        />
        <label
          htmlFor="csv-file-input"
          className="px-2 py-0.5 border border-white/15 rounded bg-white/[0.06] text-white/80 cursor-pointer font-mono text-[10px] hover:bg-white/12"
        >
          Choose CSV File...
        </label>
      </div>

      {error && <span className="text-[10px] text-red-400">{error}</span>}

      {parsed && (
        <>
          <span className="text-[10px] text-white/35">{rows.length} rows, {columns.length} columns</span>
          <div className="flex flex-wrap gap-0.5">
            {columns.map((col, i) => (
              <span
                key={i}
                className="text-[9px] px-1.5 py-px rounded bg-blue-400/10 text-blue-400/80 border border-blue-400/15"
              >
                {col.name}: {formatColType(col.type)}{col.nullable ? '?' : ''}
              </span>
            ))}
          </div>
          <button
            className="px-2.5 py-1.5 border rounded bg-[#007acc] text-white border-[#007acc] cursor-pointer font-mono text-[11px] hover:bg-[#005f99] disabled:opacity-30 disabled:cursor-default"
            onClick={handleLoad}
            disabled={!tableName.trim()}
          >
            Load {rows.length} Rows
          </button>
        </>
      )}
    </CollapsibleSection>
  );
}
