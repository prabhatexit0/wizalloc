import { useState } from 'react';
import { useStorageStore } from '@/stores/storage';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import ColumnEditor, { type Column } from './ColumnEditor';
import type { ColumnDef } from '@/wasm/storage-types';

const ROW_PRESETS = [10, 50, 100, 500];

function toColumnDefs(columns: Column[]): ColumnDef[] {
  return columns.map((c) => {
    let type_: string | { VarChar: number } | { Blob: number } = c.type;
    if (c.type === 'VarChar') type_ = { VarChar: c.maxLen };
    if (c.type === 'Blob') type_ = { Blob: c.maxLen };
    return { name: c.name, type: type_, nullable: c.nullable };
  });
}

interface QuickFillPanelProps {
  open: boolean;
  onToggle: () => void;
}

export default function QuickFillPanel({ open, onToggle }: QuickFillPanelProps) {
  const bootstrapTable = useStorageStore((s) => s.bootstrapTable);
  const [tableName, setTableName] = useState('users');
  const [rowCount, setRowCount] = useState(100);
  const [columns, setColumns] = useState<Column[]>([
    { name: 'id', type: 'Int32', nullable: false, maxLen: 255 },
    { name: 'name', type: 'VarChar', nullable: false, maxLen: 32 },
    { name: 'email', type: 'VarChar', nullable: false, maxLen: 64 },
    { name: 'age', type: 'UInt32', nullable: false, maxLen: 255 },
    { name: 'active', type: 'Bool', nullable: false, maxLen: 255 },
  ]);

  function handleFill() {
    if (!tableName.trim()) return;
    bootstrapTable(tableName.trim(), toColumnDefs(columns), rowCount);
  }

  return (
    <CollapsibleSection
      title="Quick Fill"
      open={open}
      onToggle={onToggle}
      description="Create a table and populate it with random data to explore the storage engine"
    >
      <input
        type="text"
        value={tableName}
        onChange={(e) => setTableName(e.target.value)}
        placeholder="Table name"
        className="w-full bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
      />
      <ColumnEditor columns={columns} onChange={setColumns} />

      <span className="text-[10px] text-white/50">Row Count</span>
      <div className="flex gap-1 flex-wrap">
        {ROW_PRESETS.map((preset) => (
          <button
            key={preset}
            className={`px-2 py-0.5 border rounded text-[11px] font-mono cursor-pointer ${
              rowCount === preset
                ? 'bg-[#007acc] text-white border-[#007acc]'
                : 'bg-transparent text-white/60 border-white/15 hover:bg-white/[0.08]'
            }`}
            onClick={() => setRowCount(preset)}
          >
            {preset}
          </button>
        ))}
      </div>

      <button
        className="px-2.5 py-1.5 border rounded bg-[#007acc] text-white border-[#007acc] cursor-pointer font-mono text-[11px] hover:bg-[#005f99] disabled:opacity-30 disabled:cursor-default"
        onClick={handleFill}
        disabled={!tableName.trim()}
      >
        Create &amp; Fill
      </button>
    </CollapsibleSection>
  );
}

export { toColumnDefs };
