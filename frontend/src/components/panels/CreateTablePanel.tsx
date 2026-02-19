import { useState } from 'react';
import { useStorageStore } from '@/stores/storage';
import CollapsibleSection from '@/components/layout/CollapsibleSection';
import ColumnEditor, { type Column } from './ColumnEditor';
import { toColumnDefs } from './QuickFillPanel';

interface CreateTablePanelProps {
  open: boolean;
  onToggle: () => void;
}

export default function CreateTablePanel({ open, onToggle }: CreateTablePanelProps) {
  const createTable = useStorageStore((s) => s.createTable);
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<Column[]>([
    { name: 'id', type: 'Int32', nullable: false, maxLen: 255 },
    { name: 'name', type: 'VarChar', nullable: false, maxLen: 255 },
  ]);

  function handleCreate() {
    if (!tableName.trim()) return;
    createTable(tableName.trim(), toColumnDefs(columns));
    setTableName('');
  }

  return (
    <CollapsibleSection title="Create Table" open={open} onToggle={onToggle}>
      <input
        type="text"
        value={tableName}
        onChange={(e) => setTableName(e.target.value)}
        placeholder="Table name"
        className="w-full bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
      />
      <ColumnEditor columns={columns} onChange={setColumns} />
      <div className="flex gap-1">
        <button
          className="px-2 py-0.5 border border-[#007acc] rounded bg-[#007acc] text-white cursor-pointer font-mono text-[10px] hover:bg-[#005f99] disabled:opacity-30 disabled:cursor-default"
          onClick={handleCreate}
          disabled={!tableName.trim()}
        >
          Create
        </button>
      </div>
    </CollapsibleSection>
  );
}
