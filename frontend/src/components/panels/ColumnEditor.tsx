interface Column {
  name: string;
  type: string;
  maxLen: number;
  nullable: boolean;
}

interface ColumnEditorProps {
  columns: Column[];
  onChange: (columns: Column[]) => void;
}

export default function ColumnEditor({ columns, onChange }: ColumnEditorProps) {
  function update(index: number, field: keyof Column, value: string | number | boolean) {
    const next = columns.map((c, i) =>
      i === index ? { ...c, [field]: value } : c,
    );
    onChange(next);
  }

  function add() {
    onChange([...columns, { name: '', type: 'Int32', nullable: false, maxLen: 255 }]);
  }

  function remove(index: number) {
    onChange(columns.filter((_, i) => i !== index));
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {columns.map((col, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={col.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="col name"
              className="w-20 bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
            />
            <select
              value={col.type}
              onChange={(e) => update(i, 'type', e.target.value)}
              className="w-20 bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
            >
              <option value="Int32">Int32</option>
              <option value="UInt32">UInt32</option>
              <option value="Float64">Float64</option>
              <option value="Bool">Bool</option>
              <option value="VarChar">VarChar</option>
              <option value="Blob">Blob</option>
            </select>
            {(col.type === 'VarChar' || col.type === 'Blob') && (
              <input
                type="number"
                value={col.maxLen}
                onChange={(e) => update(i, 'maxLen', Number(e.target.value))}
                min={1}
                max={65535}
                className="w-12 bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
              />
            )}
            <label className="flex items-center gap-0.5 text-[10px] text-white/50 cursor-pointer">
              <input
                type="checkbox"
                checked={col.nullable}
                onChange={(e) => update(i, 'nullable', e.target.checked)}
                className="w-3 h-3"
              />
              <span>null</span>
            </label>
            <button
              className="bg-transparent border-0 text-white/40 cursor-pointer text-sm px-1 leading-none hover:text-red-400"
              onClick={() => remove(i)}
              title="Remove column"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <button
          className="px-2 py-0.5 border border-white/15 rounded bg-white/[0.06] text-white/80 cursor-pointer font-mono text-[10px] hover:bg-white/12"
          onClick={add}
        >
          + Column
        </button>
      </div>
    </>
  );
}

export type { Column };
